import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPECTED_INDEXES, EXPECTED_STORES, STORE_NAME } from './core.stores.ts';

const dbMocks = vi.hoisted(() => ({
  openDB: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: dbMocks.openDB,
}));

function createStoreNames(initialStores: readonly string[]) {
  const storeNames = [...initialStores] as string[] & { contains(name: string): boolean };
  storeNames.contains = (name: string) => storeNames.includes(name);
  return storeNames;
}

function createIndexNames(initialIndexNames: readonly string[]) {
  const indexNames = [...initialIndexNames] as string[] & { contains(name: string): boolean };
  indexNames.contains = (name: string) => indexNames.includes(name);
  return indexNames;
}

function createExpectedIndexMap(overrides: Partial<Record<string, readonly string[]>> = {}) {
  const indexMap = new Map<string, string[]>();
  for (const [storeName, indexNames] of Object.entries(EXPECTED_INDEXES)) {
    indexMap.set(storeName, [...indexNames]);
  }
  for (const [storeName, indexNames] of Object.entries(overrides)) {
    if (!indexNames) {
      continue;
    }
    indexMap.set(storeName, [...indexNames]);
  }
  return indexMap;
}

function createMockDb(
  initialStores: readonly string[] = [],
  initialIndexes = new Map<string, string[]>()
) {
  const storeNames = createStoreNames(initialStores);
  const indexes = new Map(initialIndexes);

  return {
    close: vi.fn(),
    createObjectStore: vi.fn((name: string) => {
      if (!storeNames.includes(name)) {
        storeNames.push(name);
      }
      if (!indexes.has(name)) {
        indexes.set(name, []);
      }

      return {
        createIndex: vi.fn((indexName: string) => {
          indexes.get(name)?.push(indexName);
        }),
      };
    }),
    deleteObjectStore: vi.fn((name: string) => {
      const index = storeNames.indexOf(name);
      if (index >= 0) {
        storeNames.splice(index, 1);
      }
      indexes.delete(name);
    }),
    objectStoreNames: storeNames,
    transaction: vi.fn((storeName: string | string[]) => {
      return {
        objectStore: vi.fn((requestedStoreName = storeName) => {
          const name = Array.isArray(requestedStoreName)
            ? requestedStoreName[0]
            : requestedStoreName;
          return { indexNames: createIndexNames(indexes.get(name) ?? []) };
        }),
      };
    }),
  };
}

function createCompleteDb(indexOverrides: Partial<Record<string, readonly string[]>> = {}) {
  return createMockDb(EXPECTED_STORES, createExpectedIndexMap(indexOverrides));
}

function stubPersistentStorage() {
  vi.stubGlobal('navigator', {
    storage: {
      persist: vi.fn().mockResolvedValue(true),
    },
  });
}

async function importDbModule() {
  vi.resetModules();
  return import('./core');
}

async function verifyTerminationSubscribers() {
  stubPersistentStorage();
  const completeDb = createCompleteDb();
  dbMocks.openDB.mockResolvedValueOnce(completeDb);
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const listener = vi.fn();

  const module = await importDbModule();
  const unsubscribe = module.subscribeToDbTermination(listener);
  module.subscribeToDbTermination(() => {
    throw new Error('listener failed');
  });
  await module.initDB();

  const firstOpenOptions = dbMocks.openDB.mock.calls[0]?.[2];
  firstOpenOptions.terminated();

  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({
      dbName: 'sniptale-video-db',
      dbVersion: expect.any(Number),
    })
  );
  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedDbCore]',
    'Database termination listener threw',
    expect.any(Error)
  );

  unsubscribe();
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.openDB.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shared db core persistent storage', () => {
  it('caches persistence checks and falls back to false when persistence is unavailable', async () => {
    stubPersistentStorage();

    const module = await importDbModule();
    expect(await module.requestPersistentStorageGrant()).toBe(true);
    expect(await module.requestPersistentStorageGrant()).toBe(true);
    expect(await module.ensurePersistentStorage()).toBe(true);
    expect(navigator.storage.persist).toHaveBeenCalledTimes(1);

    vi.resetModules();
    vi.stubGlobal('navigator', {});
    const withoutPersist = await import('./core');
    expect(await withoutPersist.requestPersistentStorageGrant()).toBe(false);
  });

  it('falls back to false when the persistence request rejects', async () => {
    vi.resetModules();
    vi.stubGlobal('navigator', {
      storage: {
        persist: vi.fn().mockRejectedValue(new Error('persist failed')),
      },
    });

    const module = await import('./core');
    await expect(module.requestPersistentStorageGrant()).resolves.toBe(false);
  });
});

describe('shared db core initDB cache', () => {
  it('reuses the cached promise when all expected stores already exist', async () => {
    stubPersistentStorage();
    const completeDb = createCompleteDb();
    dbMocks.openDB.mockResolvedValue(completeDb);

    const module = await importDbModule();
    const first = module.initDB();
    const second = module.initDB();

    expect(await first).toBe(await second);
    expect(dbMocks.openDB).toHaveBeenCalledTimes(1);
  });
});

describe('shared db core initDB schema mismatch', () => {
  it('rejects initialization when required stores are missing', async () => {
    stubPersistentStorage();
    const incompleteDb = createMockDb(['recordings']);
    dbMocks.openDB.mockResolvedValueOnce(incompleteDb);

    const module = await importDbModule();
    await expect(module.initDB()).rejects.toThrow(
      'IndexedDB schema mismatch for sniptale-video-db: missing stores'
    );
    expect(incompleteDb.close).toHaveBeenCalledTimes(1);
    expect(dbMocks.openDB).toHaveBeenCalledTimes(1);
  });

  it('rejects initialization when required store indexes are missing', async () => {
    stubPersistentStorage();
    const incompleteIndexDb = createCompleteDb({ [STORE_NAME]: [] });
    dbMocks.openDB.mockResolvedValueOnce(incompleteIndexDb);

    const module = await importDbModule();
    await expect(module.initDB()).rejects.toThrow(
      'IndexedDB schema mismatch for sniptale-video-db: missing indexes recordings.createdAt'
    );
    expect(incompleteIndexDb.close).toHaveBeenCalledTimes(1);
    expect(dbMocks.openDB).toHaveBeenCalledTimes(1);
  });

  it('resets the init promise cache after a schema mismatch failure', async () => {
    stubPersistentStorage();
    const incompleteDb = createMockDb(['recordings']);
    const completeDb = createCompleteDb();
    dbMocks.openDB.mockResolvedValueOnce(incompleteDb).mockResolvedValueOnce(completeDb);

    const module = await importDbModule();
    await expect(module.initDB()).rejects.toThrow('IndexedDB schema mismatch');
    await expect(module.initDB()).resolves.toBe(completeDb);
    expect(dbMocks.openDB).toHaveBeenCalledTimes(2);
  });
});

describe('shared db core initDB recovery', () => {
  it('resets the cache after termination and failed initialization', async () => {
    stubPersistentStorage();
    const firstDb = createCompleteDb();
    const secondDb = createCompleteDb();

    dbMocks.openDB.mockResolvedValueOnce(firstDb).mockResolvedValueOnce(secondDb);

    const module = await importDbModule();
    await module.initDB();

    const firstCallOptions = dbMocks.openDB.mock.calls[0]?.[2];
    firstCallOptions.terminated();
    await module.initDB();
    expect(dbMocks.openDB).toHaveBeenCalledTimes(2);

    vi.resetModules();
    dbMocks.openDB.mockReset();
    dbMocks.openDB.mockRejectedValueOnce(new Error('open failed')).mockResolvedValueOnce(secondDb);

    const afterFailure = await import('./core');
    await expect(afterFailure.initDB()).rejects.toThrow('open failed');
    await expect(afterFailure.initDB()).resolves.toBe(secondDb);
  });

  it(
    'notifies termination subscribers and tolerates listener failures',
    verifyTerminationSubscribers
  );

  it('survives upgrade lifecycle callbacks on recreated databases', async () => {
    stubPersistentStorage();
    const firstDb = createCompleteDb();
    const secondDb = createCompleteDb();
    dbMocks.openDB.mockResolvedValueOnce(firstDb).mockResolvedValueOnce(secondDb);

    const module = await importDbModule();
    await module.initDB();

    const firstOpenOptions = dbMocks.openDB.mock.calls[0]?.[2];
    firstOpenOptions.blocked();
    firstOpenOptions.blocking();
    firstOpenOptions.terminated();

    await module.initDB();
    expect(dbMocks.openDB).toHaveBeenCalledTimes(2);
  });
});

describe('shared db core privacy erasure', () => {
  it('closes the cached connection, deletes the database, and verifies absence', async () => {
    stubPersistentStorage();
    const completeDb = createCompleteDb();
    dbMocks.openDB.mockResolvedValueOnce(completeDb);
    const request = {} as IDBOpenDBRequest;
    const deleteDatabase = vi.fn(() => {
      queueMicrotask(() => request.onsuccess?.call(request, new Event('success')));
      return request;
    });
    vi.stubGlobal('indexedDB', {
      databases: vi.fn().mockResolvedValue([]),
      deleteDatabase,
    });

    const module = await importDbModule();
    await module.initDB();
    await module.eraseSniptaleDatabaseForPrivacyErasure();

    expect(completeDb.close).toHaveBeenCalled();
    expect(deleteDatabase).toHaveBeenCalledWith('sniptale-video-db');
    await expect(module.verifySniptaleDatabaseAbsentAfterPrivacyErasure()).resolves.toBe(true);
  });
});
