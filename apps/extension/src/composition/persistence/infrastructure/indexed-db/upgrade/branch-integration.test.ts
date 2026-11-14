import { betaV55Fixture } from '../fixtures/beta-v55';
import { betaV54Fixture } from '../fixtures/beta-v54';
import { betaV53Fixture } from '../fixtures/beta-v53';
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
  VIDEO_EFFECT_BUNDLES_STORE,
  VIDEO_ANIMATION_PACKAGES_STORE,
  VIDEO_VISUAL_PREFERENCES_STORE,
  VIDEO_GL_TRANSITION_PRESETS_STORE,
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
  version: 47 | 48 | 51 | 53 | 54 | 55,
  corruption?: SourceCorruption,
  canonical = false
): Promise<string> {
  const name = DB_NAME;
  databases.push(name);
  const base =
    version === 55
      ? betaV55Fixture
      : version === 54
        ? betaV54Fixture
        : version === 53
          ? betaV53Fixture
          : version === 51
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

it.each([false, true])(
  'creates the animation namespace without parsing or rewriting opaque legacy rows, interrupted=%s',
  async (interrupted) => {
    const name = await createSource(53);
    const legacy = {
      packId: 'legacy-v1',
      source: 'opaque legacy bytes; not a new animation package',
      bytes: new Uint8Array([0, 255, 16, 32]),
    };
    const source = await openDB(name);
    await source.put(VIDEO_EFFECT_BUNDLES_STORE, legacy);
    source.close();
    if (interrupted) {
      const migrations = DATABASE_MIGRATIONS.map((migration) =>
        migration.toDatabaseVersion === 54
          ? {
              ...migration,
              migrate(
                db: Parameters<typeof migration.migrate>[0],
                transaction: Parameters<typeof migration.migrate>[1]
              ): undefined {
                migration.migrate(db, transaction);
                throw new Error('Interrupted animation namespace creation');
              },
            }
          : migration
      );
      await expect(
        openDB(name, DB_VERSION, {
          upgrade(db, oldVersion, newVersion, transaction) {
            try {
              executeDatabaseUpgrade(db, oldVersion, newVersion, transaction, migrations);
            } catch {
              /* The open request reports the aborted upgrade. */
            }
          },
        })
      ).rejects.toMatchObject({ name: 'AbortError' });
      const retained = await openDB(name);
      expect(retained.version).toBe(53);
      expect(retained.objectStoreNames.contains(VIDEO_ANIMATION_PACKAGES_STORE)).toBe(false);
      expect(await retained.get(VIDEO_EFFECT_BUNDLES_STORE, legacy.packId)).toEqual(legacy);
      retained.close();
    }
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    const upgraded = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    expect(await upgraded.get(VIDEO_EFFECT_BUNDLES_STORE, legacy.packId)).toEqual(legacy);
    expect(await upgraded.getAll(VIDEO_ANIMATION_PACKAGES_STORE)).toEqual([]);
    expect([...upgraded.transaction(VIDEO_ANIMATION_PACKAGES_STORE).store.indexNames]).toEqual([
      'enabled',
      'updatedAt',
    ]);
    upgraded.close();
  }
);

it.each([false, true])(
  'copies prototype preferences without rewriting package or legacy rows, interrupted=%s',
  async (interrupted) => {
    const name = await createSource(54);
    const source = JSON.stringify({
      format: 'sniptale-animation',
      version: 1,
      id: 'retained-animation',
      label: { en: 'Retained' },
      controls: [],
      resources: [],
      bindings: [],
      animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 0, op: 60, layers: [], assets: [] },
    });
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))),
      (byte) => byte.toString(16).padStart(2, '0')
    ).join('');
    const presetPreferences = {
      presets: [{ id: 'retained', name: 'Retained preference', values: { accent: '#f59a45' } }],
    };
    const packageRow = {
      format: 'sniptale-animation-catalog',
      version: 1,
      packId: 'animation.retained-animation',
      source: 'lottie-json',
      sourceSha256: sha256,
      label: { en: 'Retained' },
      enabled: false,
      createdAt: 1,
      updatedAt: 1,
      retainedByteLength:
        new TextEncoder().encode(source).byteLength +
        new TextEncoder().encode(JSON.stringify(presetPreferences)).byteLength,
      documents: [{ id: 'retained-animation', source, sha256, enabled: false, presetPreferences }],
    };
    const opaque = {
      packId: 'opaque-legacy',
      source: 'Do not interpret old EffectV1 bytes',
      value: [0, 255],
    };
    const old = await openDB(name, 54);
    await old.put(VIDEO_ANIMATION_PACKAGES_STORE, packageRow);
    await old.put(VIDEO_EFFECT_BUNDLES_STORE, opaque);
    old.close();
    if (interrupted) {
      await expect(
        openDB(name, DB_VERSION, {
          upgrade(db, oldVersion, newVersion, transaction) {
            executeDatabaseUpgrade(
              db,
              oldVersion,
              newVersion,
              transaction,
              DATABASE_MIGRATIONS.map((migration) =>
                migration.toDatabaseVersion === 55
                  ? {
                      ...migration,
                      migrate(database, tx) {
                        migration.migrate(database, tx);
                        throw new Error('Interrupted preference copy');
                      },
                    }
                  : migration
              )
            );
          },
        })
      ).rejects.toThrow();
      const retained = await openDB(name, 54);
      expect(retained.objectStoreNames.contains(VIDEO_VISUAL_PREFERENCES_STORE)).toBe(false);
      expect(await retained.get(VIDEO_ANIMATION_PACKAGES_STORE, packageRow.packId)).toEqual(
        packageRow
      );
      retained.close();
    }
    const upgraded = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      expect(await upgraded.get(VIDEO_ANIMATION_PACKAGES_STORE, packageRow.packId)).toEqual(
        packageRow
      );
      expect(await upgraded.get(VIDEO_EFFECT_BUNDLES_STORE, opaque.packId)).toEqual(opaque);
      expect(
        await upgraded.get(VIDEO_VISUAL_PREFERENCES_STORE, ['animation', packageRow.packId])
      ).toEqual({
        format: 'sniptale-visual-preferences',
        version: 1,
        kind: 'animation',
        packId: packageRow.packId,
        enabled: false,
        documents: {
          'retained-animation': { sourceSha256: sha256, enabled: false, presetPreferences },
        },
      });
      expect(await upgraded.get('schema_contracts', 'effects')).toEqual({
        domainId: 'effects',
        schemaVersion: 4,
      });
    } finally {
      upgraded.close();
    }
  }
);

it('rolls back coupled package and preference deletion before allowing an atomic retry', async () => {
  const name = await createSource(54);
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const source = JSON.stringify({
    format: 'sniptale-animation',
    version: 1,
    id: 'atomic',
    label: { en: 'Atomic' },
    controls: [],
    resources: [],
    bindings: [],
    animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 0, op: 60, layers: [], assets: [] },
  });
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
  const packet = {
    format: 'sniptale-animation-catalog',
    version: 2,
    packId: 'animation.atomic',
    source: 'lottie-json',
    sourceSha256: sha256,
    label: { en: 'Atomic' },
    createdAt: 1,
    updatedAt: 1,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    documents: [{ id: 'atomic', source, sha256 }],
  };
  const preference = {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind: 'animation',
    packId: packet.packId,
    documents: { atomic: { sourceSha256: sha256, enabled: false } },
  };
  await db.put(VIDEO_ANIMATION_PACKAGES_STORE, packet);
  await db.put(VIDEO_VISUAL_PREFERENCES_STORE, preference);
  const failed = db.transaction(
    [VIDEO_ANIMATION_PACKAGES_STORE, VIDEO_VISUAL_PREFERENCES_STORE],
    'readwrite'
  );
  await failed.objectStore(VIDEO_ANIMATION_PACKAGES_STORE).delete(packet.packId);
  failed.abort();
  await expect(failed.done).rejects.toThrow();
  expect(await db.get(VIDEO_ANIMATION_PACKAGES_STORE, packet.packId)).toEqual(packet);
  expect(await db.get(VIDEO_VISUAL_PREFERENCES_STORE, ['animation', packet.packId])).toEqual(
    preference
  );
  const retry = db.transaction(
    [VIDEO_ANIMATION_PACKAGES_STORE, VIDEO_VISUAL_PREFERENCES_STORE],
    'readwrite'
  );
  await retry.objectStore(VIDEO_ANIMATION_PACKAGES_STORE).delete(packet.packId);
  await retry.objectStore(VIDEO_VISUAL_PREFERENCES_STORE).delete(['animation', packet.packId]);
  await retry.done;
  expect(await db.get(VIDEO_ANIMATION_PACKAGES_STORE, packet.packId)).toBeUndefined();
  expect(
    await db.get(VIDEO_VISUAL_PREFERENCES_STORE, ['animation', packet.packId])
  ).toBeUndefined();
  db.close();
});

it.each([false, true])(
  'adds GL preset storage without changing existing resources, interrupted=%s',
  async (interrupted) => {
    const name = await createSource(55),
      source = await openDB(name, 55);
    const previousRows: Record<string, unknown[]> = {};
    for (const store of source.objectStoreNames) previousRows[store] = await source.getAll(store);
    const opaque = { packId: 'opaque-gl-upgrade', bytes: [0, 255, 17] };
    await source.put(VIDEO_EFFECT_BUNDLES_STORE, opaque);
    previousRows[VIDEO_EFFECT_BUNDLES_STORE] = await source.getAll(VIDEO_EFFECT_BUNDLES_STORE);
    source.close();
    if (interrupted) {
      await expect(
        openDB(name, DB_VERSION, {
          upgrade(db, oldVersion, newVersion, tx) {
            executeDatabaseUpgrade(
              db,
              oldVersion,
              newVersion,
              tx,
              DATABASE_MIGRATIONS.map((migration) =>
                migration.toDatabaseVersion === 56
                  ? {
                      ...migration,
                      migrate(database, transaction) {
                        migration.migrate(database, transaction);
                        throw new Error('Interrupted GL store creation');
                      },
                    }
                  : migration
              )
            );
          },
        })
      ).rejects.toThrow();
      const retained = await openDB(name, 55);
      expect(retained.objectStoreNames.contains(VIDEO_GL_TRANSITION_PRESETS_STORE)).toBe(false);
      expect(await retained.get(VIDEO_EFFECT_BUNDLES_STORE, opaque.packId)).toEqual(opaque);
      retained.close();
    }
    const upgraded = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      for (const [store, rows] of Object.entries(previousRows)) {
        if (store === 'schema_contracts') continue;
        expect(await upgraded.getAll(store)).toEqual(rows);
      }
      expect(await upgraded.getAll(VIDEO_GL_TRANSITION_PRESETS_STORE)).toEqual([]);
      expect(await upgraded.get('schema_contracts', 'effects')).toEqual({
        domainId: 'effects',
        schemaVersion: 4,
      });
    } finally {
      upgraded.close();
    }
  }
);
