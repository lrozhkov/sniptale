import '../fake-indexed-db.test-support';
import { deleteDB, openDB } from 'idb';
import { afterEach, expect, it } from 'vitest';
import { betaV46Fixture } from '../fixtures/beta-v46';
import { betaV51Fixture } from '../fixtures/beta-v51';
import {
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
afterEach(async () => {
  for (const name of databases.splice(0)) await deleteDB(name);
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

async function createSource(version: 47 | 48 | 51): Promise<string> {
  const name = `branch-integration-${crypto.randomUUID()}`;
  databases.push(name);
  const base = version === 51 ? betaV51Fixture : betaV46Fixture;
  const sourceStores: string[] = [...base.stores];
  const sourceIndexes = new Map<string, readonly string[]>(Object.entries(base.indexes));
  if (version < 51) {
    sourceStores.push(RECORDING_CURSOR_TRAJECTORIES_STORE, RECORDING_CURSOR_BLOCKS_STORE);
    sourceIndexes.set(RECORDING_CURSOR_TRAJECTORIES_STORE, ['recordingId']);
    sourceIndexes.set(RECORDING_CURSOR_BLOCKS_STORE, ['trajectory', 'time']);
    if (version === 48) {
      sourceStores.push(RECORDING_EVENTS_STORE);
      sourceIndexes.set(RECORDING_EVENTS_STORE, ['kind', 'timeBuckets']);
    }
  }
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
        void contracts.put({
          domainId,
          schemaVersion:
            domainId === 'recordings' && version < 51 ? (version === 47 ? 4 : 5) : schemaVersion,
        });
      for (const [store, rows] of Object.entries(base.records))
        for (const row of rows) void transaction.objectStore(store).put(row);
      if (version < 51) {
        void transaction.objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE).put(cursorHead);
        void transaction.objectStore(RECORDING_CURSOR_BLOCKS_STORE).put(cursorBlock);
        if (version === 48) void transaction.objectStore(RECORDING_EVENTS_STORE).put(eventHead);
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
    } finally {
      db.close();
    }
  }
);

it('rolls back an interrupted integration and retains native history for a successful retry', async () => {
  const name = await createSource(48);
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
  expect(retained.version).toBe(48);
  expect(await retained.getAll(RECORDING_CURSOR_TRAJECTORIES_STORE)).toEqual([cursorHead]);
  expect(await retained.getAll(RECORDING_CURSOR_BLOCKS_STORE)).toEqual([cursorBlock]);
  expect(await retained.getAll(RECORDING_EVENTS_STORE)).toEqual([eventHead]);
  expect(retained.objectStoreNames.contains('secret_protection')).toBe(false);
  retained.close();
  const retried = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  try {
    expect(retried.version).toBe(DB_VERSION);
    expect(await retried.getAll(RECORDING_EVENTS_STORE)).toEqual([eventHead]);
    expect(await retried.getAll(RECORDING_CURSOR_BLOCKS_STORE)).toEqual([cursorBlock]);
  } finally {
    retried.close();
  }
});
