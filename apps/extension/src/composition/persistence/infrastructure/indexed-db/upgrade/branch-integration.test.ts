import '../fake-indexed-db.test-support';
import { deleteDB, openDB } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { betaV46Fixture } from '../fixtures/beta-v46';
import { betaV51Fixture } from '../fixtures/beta-v51';
import { betaV47Fixture } from '../fixtures/beta-v47';
import { betaV48Fixture } from '../fixtures/beta-v48';
import { nativeAppV47Fixture } from '../fixtures/native-app-v47';
import { nativeAppV48Fixture } from '../fixtures/native-app-v48';
import { inspectDatabaseAdmission } from '../admission';
import {
  DB_NAME,
  DB_VERSION,
  EXPECTED_INDEXES,
  EXPECTED_STORES,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_CURSOR_BLOCKS_STORE,
  RECORDING_EVENTS_STORE,
} from '../core.stores';
import { CURRENT_SCHEMA_CONTRACTS, DATABASE_MIGRATIONS } from '../schema-contracts';
import { executeDatabaseUpgrade, handleDatabaseUpgrade } from './core';

const databases: string[] = [];
beforeEach(() => {
  vi.stubGlobal('navigator', {
    storage: { estimate: async () => ({ quota: 2 ** 40, usage: 0 }) },
  });
});
afterEach(async () => {
  for (const name of databases.splice(0)) await deleteDB(name);
  vi.unstubAllGlobals();
});

const cursorHead = {
  recordingId: 'native-recording',
  trajectoryId: 'a'.repeat(32),
  snapshotAssetId: 'cursor-snapshot',
  preserved: ['native', 'cursor', 'history'],
};
const cursorBlock = {
  recordingId: cursorHead.recordingId,
  trajectoryId: cursorHead.trajectoryId,
  sequence: 0,
  bytes: new Uint8Array([0, 255, 17, 128]),
};
const eventHead = {
  recordingId: cursorHead.recordingId,
  eventStreamId: 'b'.repeat(32),
  kind: 'head',
  entryId: 0,
  snapshotAssetId: 'event-snapshot',
  preserved: ['native', 'interaction', 'history'],
};

type SourceCorruption =
  | 'extra-store'
  | 'missing-store'
  | 'extra-index'
  | 'missing-index'
  | 'domain-contracts'
  | 'mixed-contracts';

async function createSource(
  version: 47 | 48 | 51,
  corruption?: SourceCorruption,
  canonical = false
): Promise<string> {
  const name = DB_NAME;
  databases.push(name);
  const base =
    version === 51
      ? betaV51Fixture
      : canonical
        ? version === 47
          ? betaV47Fixture
          : betaV48Fixture
        : version === 47
          ? nativeAppV47Fixture
          : nativeAppV48Fixture;
  const sourceStores: readonly string[] = base.stores;
  const sourceIndexes = new Map<string, readonly string[]>(Object.entries(base.indexes));
  const db = await openDB(name, version, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      handleDatabaseUpgrade(db, 0, DB_VERSION, transaction);
      for (const store of [...db.objectStoreNames]) {
        if (!sourceStores.includes(store)) {
          db.deleteObjectStore(store);
          continue;
        }
        const table = transaction.objectStore(store);
        for (const index of [...table.indexNames])
          if (!sourceIndexes.get(store)?.includes(index)) table.deleteIndex(index);
      }
      const contracts = transaction.objectStore('schema_contracts');
      void contracts.clear();
      for (const [domainId, schemaVersion] of Object.entries(base.domainVersions))
        void contracts.put({ domainId, schemaVersion });
      for (const [store, rows] of Object.entries(base.records))
        for (const row of rows) void transaction.objectStore(store).put(row);
      if (version < 51 && !canonical) {
        void transaction.objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE).put(cursorHead);
        void transaction.objectStore(RECORDING_CURSOR_BLOCKS_STORE).put(cursorBlock);
        if (version === 48) void transaction.objectStore(RECORDING_EVENTS_STORE).put(eventHead);
      }
      if (corruption === 'extra-store') db.createObjectStore('unexpected');
      if (corruption === 'missing-store') db.deleteObjectStore('native_transfer_chunks');
      if (corruption === 'extra-index')
        transaction.objectStore('recordings').createIndex('unexpected', 'unexpected');
      if (corruption === 'missing-index')
        transaction.objectStore('recordings').deleteIndex('createdAt');
      if (corruption === 'domain-contracts')
        void contracts.put({ domainId: 'recordings', schemaVersion: 6 });
      if (corruption === 'mixed-contracts') {
        void contracts.clear();
        const canonicalFixture = version === 47 ? betaV47Fixture : betaV48Fixture;
        for (const [domainId, schemaVersion] of Object.entries(canonicalFixture.domainVersions))
          void contracts.put({ domainId, schemaVersion });
      }
    },
  });
  db.close();
  return name;
}

it.each([47, 48, 51] as const)(
  'preserves source rows and private history when integrating branch database %s',
  async (version) => {
    const name = await createSource(version);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      expect([...db.objectStoreNames].sort()).toEqual([...EXPECTED_STORES].sort());
      const tx = db.transaction([...db.objectStoreNames], 'readonly');
      for (const [store, indexes] of Object.entries(EXPECTED_INDEXES))
        expect([...tx.objectStore(store).indexNames].sort(), store).toEqual([...indexes].sort());
      for (const row of betaV46Fixture.records.recordings) {
        const preserved = await tx.objectStore('recordings').get(row.id);
        expect(preserved).toMatchObject(row);
      }
      if (version < 51) {
        expect(await tx.objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE).getAll()).toEqual([
          cursorHead,
        ]);
        expect(await tx.objectStore(RECORDING_CURSOR_BLOCKS_STORE).getAll()).toEqual([cursorBlock]);
        expect(
          await tx
            .objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE)
            .index('snapshotAssetId')
            .getAll(cursorHead.snapshotAssetId)
        ).toEqual([cursorHead]);
        if (version === 48)
          expect(
            await tx
              .objectStore(RECORDING_EVENTS_STORE)
              .index('snapshotAssetId')
              .getAll(eventHead.snapshotAssetId)
          ).toEqual([eventHead]);
      }
      expect(await tx.objectStore('schema_contracts').getAll()).toEqual(
        [...CURRENT_SCHEMA_CONTRACTS].sort((left, right) =>
          left.domainId.localeCompare(right.domainId)
        )
      );
      await tx.done;
      await expect(inspectDatabaseAdmission()).resolves.toEqual({
        databaseVersion: DB_VERSION,
        status: 'ready',
      });
    } finally {
      db.close();
    }
  }
);

it.each([47, 48] as const)(
  'rolls back interrupted database %s and admits its preserved history for retry',
  async (version) => {
    const name = await createSource(version);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    const interrupted = DATABASE_MIGRATIONS.map((migration) =>
      migration.fromDatabaseVersion === 52
        ? {
            ...migration,
            migrate() {
              throw new Error('Interrupted branch integration');
            },
          }
        : migration
    );
    await expect(
      openDB(name, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, tx) {
          try {
            executeDatabaseUpgrade(db, oldVersion, newVersion, tx, interrupted);
          } catch {
            // The open request reports the aborted versionchange transaction.
          }
        },
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    const retained = await openDB(name);
    expect(retained.version).toBe(version);
    expect(await retained.getAll(RECORDING_CURSOR_TRAJECTORIES_STORE)).toEqual([cursorHead]);
    expect(await retained.getAll(RECORDING_CURSOR_BLOCKS_STORE)).toEqual([cursorBlock]);
    if (version === 48) expect(await retained.getAll(RECORDING_EVENTS_STORE)).toEqual([eventHead]);
    expect(retained.objectStoreNames.contains('secret_protection')).toBe(false);
    retained.close();
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    const retried = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      expect(retried.version).toBe(DB_VERSION);
      expect(await retried.getAll(RECORDING_EVENTS_STORE)).toEqual(
        version === 48 ? [eventHead] : []
      );
      expect(await retried.getAll(RECORDING_CURSOR_BLOCKS_STORE)).toEqual([cursorBlock]);
      await expect(inspectDatabaseAdmission()).resolves.toEqual({
        databaseVersion: DB_VERSION,
        status: 'ready',
      });
    } finally {
      retried.close();
    }
  }
);

for (const version of [47, 48] as const) {
  it.each([
    ['extra-store', 'stores'],
    ['missing-store', 'stores'],
    ['extra-index', 'indexes'],
    ['missing-index', 'indexes'],
    ['domain-contracts', 'domain-contracts'],
    ['mixed-contracts', 'domain-contracts'],
  ] as const)(
    'refuses private database ' + version + ' with %s before any upgrade',
    async (corruption, reason) => {
      const name = await createSource(version, corruption);
      await expect(inspectDatabaseAdmission()).resolves.toEqual({
        databaseVersion: version,
        reason,
        status: 'corrupt',
      });
      const preserved = await openDB(name);
      try {
        expect(preserved.version).toBe(version);
        expect(await preserved.getAll(RECORDING_CURSOR_BLOCKS_STORE)).toEqual([cursorBlock]);
      } finally {
        preserved.close();
      }
    }
  );
}

it.each([47, 48] as const)(
  'retains canonical database %s admission beside the private same-version schema',
  async (version) => {
    const name = await createSource(version, undefined, true);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    const upgraded = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      expect(upgraded.version).toBe(DB_VERSION);
      expect(await upgraded.getAll(RECORDING_CURSOR_BLOCKS_STORE)).toEqual([]);
      expect(await upgraded.getAll(RECORDING_EVENTS_STORE)).toEqual([]);
      await expect(inspectDatabaseAdmission()).resolves.toEqual({
        databaseVersion: DB_VERSION,
        status: 'ready',
      });
    } finally {
      upgraded.close();
    }
  }
);
