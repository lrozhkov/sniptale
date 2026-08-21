import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_CONTRACTS, type DatabaseMigrationDescriptor } from './schema-contracts';
import { EXPECTED_INDEXES, EXPECTED_STORES } from './core.stores';

const mocks = vi.hoisted(() => {
  const local = new Map<string, unknown>();
  return {
    countAssetStorageRoots: vi.fn(async () => 0),
    deletePreviewCache: vi.fn(async () => undefined),
    eraseAssetStorage: vi.fn(async () => 0),
    local,
    openDB: vi.fn(),
    previewCacheAbsent: vi.fn(async () => true),
    storageAvailable: vi.fn(() => true),
  };
});

vi.mock('idb', () => ({ openDB: mocks.openDB }));
vi.mock('../../assets/opfs-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../assets/opfs-store')>()),
  countAssetStorageRoots: mocks.countAssetStorageRoots,
  eraseAssetStorage: mocks.eraseAssetStorage,
}));
vi.mock('../../video-preview-cache/privacy-erasure', () => ({
  eraseVideoPreviewCacheForPrivacyErasure: mocks.deletePreviewCache,
  verifyVideoPreviewCacheEmptyAfterPrivacyErasure: mocks.previewCacheAbsent,
}));
vi.mock('../browser-storage/privacy-erasure', () => ({
  privacyErasureBrowserStorage: {
    local: {
      get: vi.fn(async (key: string) =>
        mocks.local.has(key) ? { [key]: mocks.local.get(key) } : {}
      ),
      isAvailable: mocks.storageAvailable,
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) mocks.local.delete(key);
      }),
      set: vi.fn(async (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values)) mocks.local.set(key, value);
      }),
    },
  },
}));

import {
  ALPHA_RESET_JOURNAL_KEY,
  DATABASE_BACKUP_RECEIPT_KEY,
  DATABASE_RESET_JOURNAL_KEY,
  evaluateDatabaseMigrationPlan,
  inspectDatabaseAdmission,
  runAlphaPersistenceReset,
  runRecoveryPersistenceReset,
} from './admission';

function createCurrentDatabase(
  options: {
    contracts?: unknown[];
    indexes?: Record<string, readonly string[]>;
    stores?: readonly string[];
    version?: number;
  } = {}
) {
  const stores = options.stores ?? EXPECTED_STORES;
  const objectStoreNames = [...stores] as string[] & { contains(name: string): boolean };
  objectStoreNames.contains = (name) => objectStoreNames.includes(name);
  return {
    close: vi.fn(),
    getAll: vi.fn(async () => options.contracts ?? CURRENT_SCHEMA_CONTRACTS),
    objectStoreNames,
    transaction: vi.fn((storeName: string) => ({
      store: {
        indexNames:
          options.indexes?.[storeName] ??
          EXPECTED_INDEXES[storeName as keyof typeof EXPECTED_INDEXES] ??
          [],
      },
    })),
    version: options.version ?? 1,
  };
}

function migration(
  overrides: Partial<DatabaseMigrationDescriptor> = {}
): DatabaseMigrationDescriptor {
  return {
    backupCoverage: 'full',
    domainVersions: [{ domainId: 'recordings', from: 1, to: 2 }],
    estimateAdditionalBytes: async () => 0,
    fromDatabaseVersion: 1,
    migrate: () => undefined,
    risk: 'transforming',
    stores: ['recordings'],
    toDatabaseVersion: 2,
    validate: () => undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.local.clear();
  mocks.countAssetStorageRoots.mockResolvedValue(0);
  mocks.previewCacheAbsent.mockResolvedValue(true);
  mocks.storageAvailable.mockReturnValue(true);
  vi.stubGlobal('indexedDB', {
    databases: vi.fn(async () => [{ name: 'sniptale-db', version: 1 }]),
    deleteDatabase: vi.fn(),
  });
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn(async () => ({ quota: 100, usage: 0 })) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('database admission inspection', () => {
  it('fails closed when database enumeration is unavailable without creating a database', async () => {
    vi.stubGlobal('indexedDB', {});
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'connection-blocked',
      status: 'blocked',
    });
    expect(mocks.openDB).not.toHaveBeenCalled();

    vi.stubGlobal('indexedDB', undefined);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: 1,
      status: 'ready',
    });
  });

  it('resumes a journaled reset even after the alpha database itself was deleted', async () => {
    mocks.local.set(ALPHA_RESET_JOURNAL_KEY, { phase: 'pending', version: 1 });
    vi.stubGlobal('indexedDB', { databases: vi.fn(async () => []) });

    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'alpha-reset-required',
      status: 'blocked',
    });

    mocks.local.set(ALPHA_RESET_JOURNAL_KEY, { phase: 'complete', version: 1 });
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: 1,
      status: 'ready',
    });
  });

  it('accepts the exact beta contract and closes its read-only inspection connection', async () => {
    const db = createCurrentDatabase();
    mocks.openDB.mockResolvedValue(db);

    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: 1,
      status: 'ready',
    });
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('fails closed for alpha, future, missing stores, missing indexes, and invalid contracts', async () => {
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => [{ name: 'sniptale-video-db', version: 30 }]),
    });
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'alpha-reset-required',
      status: 'blocked',
    });

    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => [
        { name: 'sniptale-db', version: 1 },
        { name: 'sniptale-video-db', version: 30 },
      ]),
    });
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'legacy-alpha-collision',
      status: 'corrupt',
    });

    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => [{ name: 'sniptale-db', version: 2 }]),
    });
    mocks.openDB.mockResolvedValueOnce(createCurrentDatabase({ version: 2 }));
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'future-version',
      status: 'unsupported-version',
    });

    mocks.openDB.mockResolvedValueOnce(createCurrentDatabase({ stores: ['recordings'] }));
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'stores',
      status: 'corrupt',
    });

    mocks.openDB.mockResolvedValueOnce(
      createCurrentDatabase({ stores: [...EXPECTED_STORES, 'unexpected'] })
    );
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'stores',
      status: 'corrupt',
    });

    mocks.openDB.mockResolvedValueOnce(createCurrentDatabase({ indexes: { recordings: [] } }));
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'indexes',
      status: 'corrupt',
    });

    mocks.openDB.mockResolvedValueOnce(
      createCurrentDatabase({ indexes: { recordings: ['createdAt', 'unexpected'] } })
    );
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'indexes',
      status: 'corrupt',
    });

    mocks.openDB.mockResolvedValueOnce(createCurrentDatabase({ contracts: [] }));
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'domain-contracts',
      status: 'corrupt',
    });
  });
});

describe('migration admission policy', () => {
  it('requires backup coverage before a destructive migration', async () => {
    await expect(
      evaluateDatabaseMigrationPlan(1, [migration({ backupCoverage: 'none', risk: 'destructive' })])
    ).resolves.toMatchObject({ status: 'backup-required' });
  });

  it('rejects insufficient and unknown quota before admitting a transforming migration', async () => {
    const needsSpace = migration({ estimateAdditionalBytes: async () => 80 });
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn(async () => ({ quota: 100, usage: 30 })) },
    });
    await expect(evaluateDatabaseMigrationPlan(1, [needsSpace])).resolves.toMatchObject({
      availableBytes: 70,
      requiredBytes: 80,
      status: 'insufficient-space',
    });
    vi.stubGlobal('navigator', { storage: { estimate: vi.fn(async () => ({})) } });
    await expect(evaluateDatabaseMigrationPlan(1, [needsSpace])).resolves.toMatchObject({
      availableBytes: 0,
      status: 'insufficient-space',
    });
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn(async () => Promise.reject(new Error('unavailable'))) },
    });
    await expect(evaluateDatabaseMigrationPlan(1, [needsSpace])).resolves.toMatchObject({
      availableBytes: 0,
      status: 'insufficient-space',
    });
  });

  it('admits a registered non-destructive migration after quota proof', async () => {
    await expect(evaluateDatabaseMigrationPlan(1, [migration()])).resolves.toEqual({
      databaseVersion: 1,
      status: 'ready',
    });
  });

  it('fails closed when a migration cannot prove a finite space estimate', async () => {
    await expect(
      evaluateDatabaseMigrationPlan(1, [
        migration({ estimateAdditionalBytes: async () => Number.NaN }),
      ])
    ).resolves.toMatchObject({ reason: 'migration-path-missing', status: 'unsupported-version' });
    await expect(
      evaluateDatabaseMigrationPlan(1, [
        migration({ estimateAdditionalBytes: async () => Promise.reject(new Error('estimate')) }),
      ])
    ).resolves.toMatchObject({ reason: 'migration-path-missing', status: 'unsupported-version' });
  });
});

describe('restartable alpha reset', () => {
  it('keeps the journal after interruption and clears it only after complete verification', async () => {
    const deleteDatabase = vi.fn(() => {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.call(request, new Event('success')));
      return request;
    });
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => []),
      deleteDatabase,
    });
    mocks.eraseAssetStorage.mockRejectedValueOnce(new Error('interrupted'));

    await expect(runAlphaPersistenceReset()).rejects.toThrow('interrupted');
    expect(mocks.local.get(ALPHA_RESET_JOURNAL_KEY)).toEqual({ phase: 'pending', version: 1 });

    await expect(runAlphaPersistenceReset()).resolves.toBeUndefined();
    expect(mocks.local.has(ALPHA_RESET_JOURNAL_KEY)).toBe(false);
    expect(deleteDatabase).toHaveBeenCalledTimes(2);
  });

  it('fails closed when journaling is unavailable or reset verification fails', async () => {
    mocks.storageAvailable.mockReturnValue(false);
    await expect(runAlphaPersistenceReset()).rejects.toMatchObject({
      admission: { reason: 'connection-blocked', status: 'blocked' },
    });

    mocks.storageAvailable.mockReturnValue(true);
    const deleteDatabase = vi.fn(() => {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.call(request, new Event('success')));
      return request;
    });
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => [{ name: 'sniptale-video-db', version: 30 }]),
      deleteDatabase,
    });
    mocks.countAssetStorageRoots.mockResolvedValue(1);
    await expect(runAlphaPersistenceReset()).rejects.toThrow(
      'Alpha persistence reset verification failed'
    );
    expect(mocks.local.has(ALPHA_RESET_JOURNAL_KEY)).toBe(true);
  });

  it('surfaces blocked and failed database deletion without clearing the journal', async () => {
    const blocked = {} as IDBOpenDBRequest;
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => []),
      deleteDatabase: vi.fn(() => {
        queueMicrotask(() =>
          blocked.onblocked?.call(blocked, new Event('blocked') as IDBVersionChangeEvent)
        );
        return blocked;
      }),
    });
    await expect(runAlphaPersistenceReset()).rejects.toMatchObject({
      cause: { admission: { reason: 'connection-blocked', status: 'blocked' } },
      name: 'PersistenceResetInterruptedError',
    });

    const failed = { error: new Error('delete failed') } as IDBOpenDBRequest;
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => []),
      deleteDatabase: vi.fn(() => {
        queueMicrotask(() => failed.onerror?.call(failed, new Event('error')));
        return failed;
      }),
    });
    await expect(runAlphaPersistenceReset()).rejects.toThrow('delete failed');
  });
});

describe('restartable explicit recovery reset', () => {
  it('resumes after interruption and admits a fresh database only after verified cleanup', async () => {
    mocks.local.set(ALPHA_RESET_JOURNAL_KEY, { phase: 'pending', version: 1 });
    mocks.local.set(DATABASE_BACKUP_RECEIPT_KEY, { sourceVersion: 1 });
    const databaseNames: string[] = ['sniptale-db'];
    const deleteDatabase = vi.fn((name: string) => {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        databaseNames.splice(databaseNames.indexOf(name), 1);
        request.onsuccess?.call(request, new Event('success'));
      });
      return request;
    });
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => databaseNames.map((name) => ({ name, version: 1 }))),
      deleteDatabase,
    });
    mocks.eraseAssetStorage.mockRejectedValueOnce(new Error('interrupted'));

    await expect(runRecoveryPersistenceReset()).rejects.toThrow('interrupted');
    expect(mocks.local.get(DATABASE_RESET_JOURNAL_KEY)).toEqual({
      phase: 'pending',
      version: 1,
    });
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({
      reason: 'recovery-reset-required',
      status: 'blocked',
    });

    await expect(runRecoveryPersistenceReset()).resolves.toBeUndefined();
    expect(mocks.local.has(DATABASE_RESET_JOURNAL_KEY)).toBe(false);
    expect(mocks.local.has(ALPHA_RESET_JOURNAL_KEY)).toBe(false);
    expect(mocks.local.has(DATABASE_BACKUP_RECEIPT_KEY)).toBe(false);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: 1,
      status: 'ready',
    });
    expect(deleteDatabase.mock.calls.map(([name]) => name)).toEqual([
      'sniptale-db',
      'sniptale-video-db',
      'sniptale-db',
      'sniptale-video-db',
    ]);
  });

  it('retains its journal when absence cannot be verified', async () => {
    const deleteDatabase = vi.fn(() => {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => request.onsuccess?.call(request, new Event('success')));
      return request;
    });
    vi.stubGlobal('indexedDB', { deleteDatabase });

    await expect(runRecoveryPersistenceReset()).rejects.toThrow(
      'Persistence reset verification failed'
    );
    expect(mocks.local.has(DATABASE_RESET_JOURNAL_KEY)).toBe(true);
  });
});
