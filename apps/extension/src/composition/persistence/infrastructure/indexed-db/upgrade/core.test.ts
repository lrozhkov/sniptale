import { expect, it, vi } from 'vitest';
import {
  DB_VERSION,
  EXPECTED_INDEXES,
  EXPECTED_STORES,
  SCHEMA_CONTRACTS_STORE,
} from '../core.stores.ts';
import {
  CURRENT_SCHEMA_CONTRACTS,
  DATABASE_MIGRATIONS,
  type DatabaseMigrationDescriptor,
} from '../schema-contracts.ts';
import { executeDatabaseUpgrade, handleDatabaseUpgrade } from './core.ts';

function createUpgradeHarness() {
  const stores = new Map<
    string,
    {
      createIndex: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    }
  >();
  const objectStoreNames = Object.assign([] as string[], {
    contains(name: string) {
      return objectStoreNames.includes(name);
    },
  });
  const db = {
    createObjectStore: vi.fn((name: string) => {
      objectStoreNames.push(name);
      const store = { createIndex: vi.fn(), put: vi.fn() };
      stores.set(name, store);
      return store;
    }),
    deleteObjectStore: vi.fn(),
    objectStoreNames,
  };
  const transaction = {
    abort: vi.fn(),
    objectStore: vi.fn(),
  };
  return { db, stores, transaction };
}

it('creates the complete current beta schema and persists every domain contract', () => {
  const harness = createUpgradeHarness();

  handleDatabaseUpgrade(harness.db, 0, DB_VERSION, harness.transaction);

  expect(harness.db.createObjectStore.mock.calls.map(([name]) => name)).toEqual(EXPECTED_STORES);
  for (const [storeName, expectedIndexes] of Object.entries(EXPECTED_INDEXES)) {
    expect(harness.stores.get(storeName)?.createIndex.mock.calls.map(([name]) => name)).toEqual(
      expectedIndexes
    );
  }
  expect(harness.db.createObjectStore).toHaveBeenCalledWith('video_project_revisions', {
    keyPath: 'projectId',
  });
  expect(
    harness.stores.get(SCHEMA_CONTRACTS_STORE)?.put.mock.calls.map(([value]) => value)
  ).toEqual(CURRENT_SCHEMA_CONTRACTS);
});

it('aborts an unregistered future source before changing stores', () => {
  const harness = createUpgradeHarness();

  expect(() =>
    handleDatabaseUpgrade(harness.db, DB_VERSION + 1, DB_VERSION + 2, harness.transaction)
  ).toThrow(`Unsupported beta database migration source: ${DB_VERSION + 1}`);
  expect(harness.transaction.abort).toHaveBeenCalledOnce();
  expect(harness.db.createObjectStore).not.toHaveBeenCalled();
});

function createMigration(overrides: Partial<DatabaseMigrationDescriptor> = {}) {
  return {
    backupCoverage: 'full' as const,
    domainVersions: [{ domainId: 'recordings' as const, from: 1, to: 2 }],
    estimateAdditionalBytes: async () => 0,
    fromDatabaseVersion: 1,
    migrate: vi.fn(() => undefined),
    risk: 'transforming' as const,
    stores: ['recordings'] as const,
    toDatabaseVersion: 2,
    validate: vi.fn(() => undefined),
    ...overrides,
  } satisfies DatabaseMigrationDescriptor;
}

it('synchronously queues a registered migration, validation, and domain contract publication', () => {
  const harness = createUpgradeHarness();
  const contracts = { put: vi.fn((_value: unknown) => undefined) };
  harness.transaction.objectStore.mockReturnValue(contracts);
  const migration = createMigration();

  executeDatabaseUpgrade(harness.db, 1, 2, harness.transaction, [migration]);

  expect(migration.migrate).toHaveBeenCalledWith(harness.db, harness.transaction);
  expect(migration.validate).toHaveBeenCalledWith(harness.db, harness.transaction);
  expect(contracts.put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(harness.transaction.abort).not.toHaveBeenCalled();
});

it('aborts a synchronous failure so retry starts from the same source version', () => {
  const interrupted = createUpgradeHarness();
  const failure = new Error('interrupted');
  const migration = createMigration({
    migrate: vi.fn(() => {
      throw failure;
    }),
  });

  expect(() =>
    executeDatabaseUpgrade(interrupted.db, 1, 2, interrupted.transaction, [migration])
  ).toThrow(failure);
  expect(interrupted.transaction.abort).toHaveBeenCalledOnce();

  const retry = createUpgradeHarness();
  const contracts = { put: vi.fn((_value: unknown) => undefined) };
  retry.transaction.objectStore.mockReturnValue(contracts);
  const retryMigration = createMigration();
  expect(() =>
    executeDatabaseUpgrade(retry.db, 1, 2, retry.transaction, [retryMigration])
  ).not.toThrow();
  expect(retryMigration.migrate).toHaveBeenCalledOnce();
});

it('aborts immediately when a malformed async descriptor is invoked without awaiting the handler', () => {
  const harness = createUpgradeHarness();
  const asyncMigration = createMigration();
  Reflect.set(
    asyncMigration,
    'migrate',
    vi.fn(async () => undefined)
  );

  expect(() =>
    executeDatabaseUpgrade(harness.db, 1, 2, harness.transaction, [asyncMigration])
  ).toThrow('Database migration migrate must synchronously enqueue transaction work');
  expect(harness.transaction.abort).toHaveBeenCalledOnce();
  expect(harness.transaction.objectStore).not.toHaveBeenCalled();
});

it('admits version 39 capture and project revision stores before publishing contracts', () => {
  const harness = createUpgradeHarness();
  const contracts = { put: vi.fn((_value: unknown) => undefined) };
  harness.transaction.objectStore.mockReturnValue(contracts);
  handleDatabaseUpgrade(harness.db, 39, 40, harness.transaction);
  expect(harness.db.createObjectStore.mock.calls).toEqual([
    ['sync_capture', { keyPath: 'key' }],
    ['video_project_revisions', { keyPath: 'projectId' }],
  ]);
  expect(harness.stores.get('video_project_revisions')?.createIndex).not.toHaveBeenCalled();
  expect(harness.stores.get('video_project_revisions')?.put).not.toHaveBeenCalled();
  expect(harness.transaction.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  expect(harness.stores.get('sync_capture')?.createIndex.mock.calls).toEqual([
    ['kind', 'kind'],
    ['rootKey', 'rootKey'],
    ['createdAt', 'createdAt'],
  ]);
  expect(contracts.put.mock.calls.map(([row]) => row)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(harness.db.deleteObjectStore).not.toHaveBeenCalled();
  expect(harness.transaction.abort).not.toHaveBeenCalled();
});

it('aborts capture admission before contract publication when native store creation fails', () => {
  const harness = createUpgradeHarness();
  harness.db.createObjectStore.mockImplementation(() => {
    throw new Error('capture store creation failed');
  });
  expect(() => handleDatabaseUpgrade(harness.db, 39, 40, harness.transaction)).toThrow(
    'capture store creation failed'
  );
  expect(harness.transaction.abort).toHaveBeenCalledOnce();
  expect(harness.transaction.objectStore).not.toHaveBeenCalled();
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 39)!;
  expect(migration.domainVersions).toEqual([
    { domainId: 'syncCapture', from: 0, to: 1 },
    { domainId: 'videoProjects', from: 8, to: 9 },
  ]);
  expect(() => migration.validate(harness.db, harness.transaction)).toThrow(
    'Sync capture or project revision store is unavailable.'
  );
});

it('aborts when project revision creation fails and permits a complete retry from version 39', () => {
  const interrupted = createUpgradeHarness();
  interrupted.db.createObjectStore.mockImplementationOnce(() => ({
    createIndex: vi.fn(),
    put: vi.fn(),
  }));
  interrupted.db.createObjectStore.mockImplementationOnce(() => {
    throw new Error('project revision store creation failed');
  });
  expect(() => handleDatabaseUpgrade(interrupted.db, 39, 40, interrupted.transaction)).toThrow(
    'project revision store creation failed'
  );
  expect(interrupted.transaction.abort).toHaveBeenCalledOnce();
  expect(interrupted.transaction.objectStore).not.toHaveBeenCalled();

  const retry = createUpgradeHarness();
  const contracts = { put: vi.fn() };
  retry.transaction.objectStore.mockReturnValue(contracts);
  handleDatabaseUpgrade(retry.db, 39, 40, retry.transaction);
  expect([...retry.stores.keys()]).toEqual(['sync_capture', 'video_project_revisions']);
  expect(contracts.put.mock.calls.map(([row]) => row)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(retry.transaction.abort).not.toHaveBeenCalled();
});

it.each(['sync_capture', 'video_project_revisions'])(
  'rejects version 40 validation when %s is absent',
  (omittedStore) => {
    const harness = createUpgradeHarness();
    const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 39)!;
    harness.db.objectStoreNames.push(
      ...['sync_capture', 'video_project_revisions'].filter((name) => name !== omittedStore)
    );
    expect(() => migration.validate(harness.db, harness.transaction)).toThrow(
      'Sync capture or project revision store is unavailable.'
    );
    expect(harness.transaction.objectStore).not.toHaveBeenCalled();
  }
);

it('adds only the empty outgoing store before publishing syncCapture version 2', () => {
  const harness = createUpgradeHarness();
  const contracts = { put: vi.fn((_value: unknown) => undefined) };
  harness.transaction.objectStore.mockReturnValue(contracts);
  handleDatabaseUpgrade(harness.db, 40, 41, harness.transaction);
  expect(harness.db.createObjectStore.mock.calls).toEqual([['sync_outbox', { keyPath: 'key' }]]);
  expect(harness.stores.get('sync_outbox')?.createIndex).not.toHaveBeenCalled();
  expect(harness.stores.get('sync_outbox')?.put).not.toHaveBeenCalled();
  expect(contracts.put.mock.calls.map(([row]) => row)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(harness.db.deleteObjectStore).not.toHaveBeenCalled();
});

it('aborts failed outgoing store creation and permits retry without source mutation', () => {
  const interrupted = createUpgradeHarness();
  interrupted.db.createObjectStore.mockImplementation(() => {
    throw new Error('outbox unavailable');
  });
  expect(() => handleDatabaseUpgrade(interrupted.db, 40, 41, interrupted.transaction)).toThrow(
    'outbox unavailable'
  );
  expect(interrupted.transaction.abort).toHaveBeenCalledOnce();
  expect(interrupted.transaction.objectStore).not.toHaveBeenCalled();
  const retry = createUpgradeHarness();
  retry.transaction.objectStore.mockReturnValue({ put: vi.fn() });
  handleDatabaseUpgrade(retry.db, 40, 41, retry.transaction);
  expect([...retry.stores.keys()]).toEqual(['sync_outbox']);
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 40)!;
  expect(migration.domainVersions).toEqual([{ domainId: 'syncCapture', from: 1, to: 2 }]);
  expect(() => migration.validate(interrupted.db, interrupted.transaction)).toThrow(
    'Sync outbox store is unavailable.'
  );
});
