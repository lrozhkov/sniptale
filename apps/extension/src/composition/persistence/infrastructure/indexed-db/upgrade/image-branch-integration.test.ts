import '../fake-indexed-db.test-support';
import { deleteDB, openDB } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inspectDatabaseAdmission } from '../admission';
import {
  DB_NAME,
  DB_VERSION,
  EDITOR_VECTOR_LIBRARY_STORE,
  EXPECTED_INDEXES,
  EXPECTED_STORES,
} from '../core.stores';
import { imageAppV54Fixture } from '../fixtures/image-app-v54';
import { imageAppV55Fixture } from '../fixtures/image-app-v55';
import { betaV69Fixture } from '../fixtures/beta-v69';
import { betaV70Fixture } from '../fixtures/beta-v70';
import { CURRENT_SCHEMA_CONTRACTS, DATABASE_MIGRATIONS } from '../schema-contracts';
import { executeDatabaseUpgrade, handleDatabaseUpgrade } from './core';

const vectorRow = { key: 'retained-vector', definitionId: 'retained', bytes: [0, 255, 17] };

beforeEach(() => {
  vi.stubGlobal('navigator', {
    storage: { estimate: async () => ({ quota: 2 ** 40, usage: 0 }) },
  });
});
afterEach(async () => {
  await deleteDB(DB_NAME);
  vi.unstubAllGlobals();
});

async function createImageSource(version: 54 | 55 | 69 | 70, corrupt = false) {
  const fixture =
    version === 70
      ? betaV70Fixture
      : version === 69
        ? betaV69Fixture
        : version === 54
          ? imageAppV54Fixture
          : imageAppV55Fixture;
  const stores: readonly string[] = fixture.stores;
  const indexes = new Map<string, readonly string[]>(Object.entries(fixture.indexes));
  const db = await openDB(DB_NAME, version, {
    upgrade(database, _old, _new, transaction) {
      handleDatabaseUpgrade(database, 0, DB_VERSION, transaction);
      for (const name of [...database.objectStoreNames]) {
        if (!stores.includes(name)) {
          database.deleteObjectStore(name);
          continue;
        }
        const store = transaction.objectStore(name);
        for (const index of [...store.indexNames])
          if (!indexes.get(name)?.includes(index)) store.deleteIndex(index);
      }
      const contracts = transaction.objectStore('schema_contracts');
      void contracts.clear();
      for (const [domainId, schemaVersion] of Object.entries(fixture.domainVersions))
        void contracts.put({ domainId, schemaVersion });
      for (const [name, rows] of Object.entries(fixture.records))
        for (const row of rows) void transaction.objectStore(name).put(row);
      if (version === 55) void transaction.objectStore(EDITOR_VECTOR_LIBRARY_STORE).put(vectorRow);
      if (corrupt) void contracts.put({ domainId: 'effects', schemaVersion: 3 });
    },
  });
  db.close();
  return fixture;
}

it.each([69, 70] as const)(
  'keeps version %s data after interruption and admits the retry',
  async (version) => {
    const fixture = await createImageSource(version);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    await expect(
      openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          handleDatabaseUpgrade(db, oldVersion, newVersion, transaction);
          transaction.abort();
        },
      })
    ).rejects.toThrow();
    const retained = await openDB(DB_NAME);
    try {
      expect(retained.version).toBe(version);
      expect(await retained.get('schema_contracts', 'mediaLibrary')).toMatchObject({
        domainId: 'mediaLibrary',
        schemaVersion: fixture.domainVersions.mediaLibrary,
      });
    } finally {
      retained.close();
    }
    const updated = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      for (const [name, rows] of Object.entries(fixture.records)) {
        if (name !== 'schema_contracts') expect(await updated.getAll(name), name).toEqual(rows);
      }
      expect(await updated.get('schema_contracts', 'mediaLibrary')).toMatchObject({
        domainId: 'mediaLibrary',
        schemaVersion: 45,
      });
      expect(await updated.getAll('video_review_identities')).toEqual([]);
    } finally {
      updated.close();
    }
  }
);

it.each([54, 55] as const)(
  'admits image branch database %s and preserves all retained rows through integration',
  async (version) => {
    const fixture = await createImageSource(version);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      expect([...db.objectStoreNames].sort()).toEqual([...EXPECTED_STORES].sort());
      for (const [name, indexes] of Object.entries(EXPECTED_INDEXES))
        expect([...db.transaction(name).store.indexNames].sort(), name).toEqual(
          [...indexes].sort()
        );
      for (const [name, rows] of Object.entries(fixture.records)) {
        if (name === 'schema_contracts' || name === EDITOR_VECTOR_LIBRARY_STORE) continue;
        expect(await db.getAll(name), name).toEqual(rows);
      }
      expect(await db.getAll(EDITOR_VECTOR_LIBRARY_STORE)).toEqual(
        version === 55 ? [vectorRow] : []
      );
      expect(await db.getAll('schema_contracts')).toEqual(
        [...CURRENT_SCHEMA_CONTRACTS].sort((a, b) => a.domainId.localeCompare(b.domainId))
      );
      await expect(inspectDatabaseAdmission()).resolves.toEqual({
        databaseVersion: DB_VERSION,
        status: 'ready',
      });
    } finally {
      db.close();
    }
  }
);

it.each([54, 55] as const)(
  'rolls back image branch database %s on interruption and accepts an unchanged retry',
  async (version) => {
    await createImageSource(version);
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({ status: 'ready' });
    await expect(
      openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          executeDatabaseUpgrade(
            db,
            oldVersion,
            newVersion,
            transaction,
            DATABASE_MIGRATIONS.map((migration) =>
              migration.toDatabaseVersion === 61
                ? {
                    ...migration,
                    migrate(database, tx) {
                      migration.migrate(database, tx);
                      throw new Error('Interrupted image branch integration');
                    },
                  }
                : migration
            )
          );
        },
      })
    ).rejects.toThrow();
    const retained = await openDB(DB_NAME);
    expect(retained.version).toBe(version);
    expect(retained.objectStoreNames.contains('video_animation_packages')).toBe(false);
    if (version === 55)
      expect(await retained.getAll(EDITOR_VECTOR_LIBRARY_STORE)).toEqual([vectorRow]);
    retained.close();
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({ status: 'ready' });
    const retried = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    expect(retried.version).toBe(DB_VERSION);
    if (version === 55)
      expect(await retried.getAll(EDITOR_VECTOR_LIBRARY_STORE)).toEqual([vectorRow]);
    retried.close();
  }
);

it.each([54, 55] as const)(
  'refuses mixed image and video branch contracts at database %s before mutation',
  async (version) => {
    await createImageSource(version, true);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: version,
      reason: 'domain-contracts',
      status: 'corrupt',
    });
    const preserved = await openDB(DB_NAME);
    expect(preserved.version).toBe(version);
    expect(preserved.objectStoreNames.contains('video_animation_packages')).toBe(false);
    if (version === 55)
      expect(await preserved.getAll(EDITOR_VECTOR_LIBRARY_STORE)).toEqual([vectorRow]);
    preserved.close();
  }
);
