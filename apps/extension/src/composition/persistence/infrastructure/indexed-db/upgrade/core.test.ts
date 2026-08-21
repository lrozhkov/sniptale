import { expect, it, vi } from 'vitest';
import { EXPECTED_INDEXES, EXPECTED_STORES, SCHEMA_CONTRACTS_STORE } from '../core.stores.ts';
import { CURRENT_SCHEMA_CONTRACTS, type DatabaseMigrationDescriptor } from '../schema-contracts.ts';
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

it('creates the complete beta-v1 schema and persists every domain contract', () => {
  const harness = createUpgradeHarness();

  handleDatabaseUpgrade(harness.db, 0, 1, harness.transaction);

  expect(harness.db.createObjectStore.mock.calls.map(([name]) => name)).toEqual(EXPECTED_STORES);
  for (const [storeName, expectedIndexes] of Object.entries(EXPECTED_INDEXES)) {
    expect(harness.stores.get(storeName)?.createIndex.mock.calls.map(([name]) => name)).toEqual(
      expectedIndexes
    );
  }
  expect(
    harness.stores.get(SCHEMA_CONTRACTS_STORE)?.put.mock.calls.map(([value]) => value)
  ).toEqual(CURRENT_SCHEMA_CONTRACTS);
});

it('aborts any non-baseline source instead of reviving alpha migration history', () => {
  const harness = createUpgradeHarness();

  expect(() => handleDatabaseUpgrade(harness.db, 30, 31, harness.transaction)).toThrow(
    'Unsupported beta database migration source: 30'
  );
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
