import { SUPPORTED_BETA_DATABASE_FIXTURES } from './fixtures';
import { openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { DB_VERSION, EXPECTED_STORES, SCHEMA_CONTRACTS_STORE } from './core.stores.ts';
import { handleDatabaseUpgrade } from './upgrade/core';
import { betaV4Fixture } from './fixtures/beta-v4';
import { betaV14Fixture } from './fixtures/beta-v14';
import { betaV16Fixture } from './fixtures/beta-v16';
import { betaV17Fixture } from './fixtures/beta-v17';
import {
  CURRENT_SCHEMA_CONTRACTS,
  DATABASE_MIGRATIONS,
  PERSISTENCE_DOMAIN_REGISTRY,
  buildDatabaseMigrationPlan,
  parseStoredSchemaContracts,
  type DatabaseMigrationDescriptor,
} from './schema-contracts.ts';

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    transaction: () => ({ store: { openCursor: async () => null } }),
    close: vi.fn(),
  })),
}));

describe('beta persistence domain registry', () => {
  it('assigns every product store to exactly one owner and keeps metadata infrastructure-owned', () => {
    const registeredStores = PERSISTENCE_DOMAIN_REGISTRY.flatMap((domain) =>
      domain.stores.map(({ storeName }) => storeName)
    );
    expect(new Set(registeredStores).size).toBe(registeredStores.length);
    expect([...registeredStores].sort()).toEqual(
      EXPECTED_STORES.filter((store) => store !== SCHEMA_CONTRACTS_STORE).sort()
    );
  });

  it('accepts the exact current contracts and rejects missing, duplicate, future, and malformed rows', () => {
    expect(parseStoredSchemaContracts(CURRENT_SCHEMA_CONTRACTS)).toEqual(CURRENT_SCHEMA_CONTRACTS);
    expect(parseStoredSchemaContracts(CURRENT_SCHEMA_CONTRACTS.slice(1))).toBeNull();
    expect(
      parseStoredSchemaContracts([
        ...CURRENT_SCHEMA_CONTRACTS.slice(1),
        CURRENT_SCHEMA_CONTRACTS[1],
      ])
    ).toBeNull();
    expect(
      parseStoredSchemaContracts(
        CURRENT_SCHEMA_CONTRACTS.map((contract, index) =>
          index === 0 ? { ...contract, schemaVersion: contract.schemaVersion + 1 } : contract
        )
      )
    ).toBeNull();
    expect(parseStoredSchemaContracts({})).toBeNull();
  });
});

describe('database migration graph', () => {
  const migration = (from: number, to: number): DatabaseMigrationDescriptor => ({
    backupCoverage: 'full',
    domainVersions: [{ domainId: 'recordings', from, to }],
    estimateAdditionalBytes: async () => 0,
    fromDatabaseVersion: from,
    migrate: () => undefined,
    risk: 'transforming',
    stores: ['recordings'],
    toDatabaseVersion: to,
    validate: () => undefined,
  });

  it('builds a contiguous direct-to-current plan and rejects gaps or downgrades', () => {
    const migrations = [migration(1, 2), migration(2, 3)];
    expect(buildDatabaseMigrationPlan(1, 3, migrations)).toEqual(migrations);
    expect(buildDatabaseMigrationPlan(2, 3, migrations)).toEqual([migrations[1]]);
    expect(buildDatabaseMigrationPlan(3, 3, migrations)).toEqual([]);
    expect(buildDatabaseMigrationPlan(3, 2, migrations)).toBeNull();
    expect(buildDatabaseMigrationPlan(1, 3, [migration(1, 2)])).toBeNull();
  });
});

it('admits source mute bindings without reading or rewriting workspace rows and rejects older contracts', () => {
  const names = new Set<string>(betaV14Fixture.stores);
  const put = vi.fn();
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      return { createIndex: vi.fn(), put };
    }),
    deleteObjectStore: vi.fn(),
  };
  const transaction = {
    abort: vi.fn(),
    objectStore: vi.fn((_name: string) => ({
      put,
      clear: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    })),
  };
  const plan = buildDatabaseMigrationPlan(14, DB_VERSION);
  expect(buildDatabaseMigrationPlan(13, DB_VERSION)?.map((step) => step.toDatabaseVersion)).toEqual(
    Array.from({ length: DB_VERSION - 13 }, (_, index) => 14 + index)
  );
  expect(plan).toHaveLength(DB_VERSION - 14);
  expect(plan?.[0]?.domainVersions).toEqual([{ domainId: 'mediaLibrary', from: 13, to: 14 }]);
  expect(plan?.[1]?.domainVersions).toEqual([{ domainId: 'mediaLibrary', from: 14, to: 15 }]);
  expect(plan?.[2]?.domainVersions).toEqual([{ domainId: 'mediaLibrary', from: 15, to: 16 }]);
  expect(plan?.[3]?.domainVersions).toEqual([{ domainId: 'mediaLibrary', from: 16, to: 17 }]);
  handleDatabaseUpgrade(db, 14, DB_VERSION, transaction);
  expect(transaction.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(db.createObjectStore.mock.calls).toEqual([
    ['video_workspace_history', { keyPath: ['aggregateId', 'ordinal'] }],
    ['scenario_project_history', { keyPath: ['projectId', 'revision'] }],
    ['scenario_project_units', { keyPath: ['projectId', 'unitId', 'revision'] }],
    ['recording_recovery_sessions', { keyPath: 'id' }],
    ['recording_recovery_blocks', { keyPath: ['id', 'index'] }],
  ]);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  const olderContracts = Object.entries(betaV14Fixture.domainVersions).map(
    ([domainId, schemaVersion]) => ({ domainId, schemaVersion })
  );
  expect(parseStoredSchemaContracts(olderContracts)).toBeNull();
  expect(buildDatabaseMigrationPlan(DB_VERSION, 14)).toBeNull();
  put.mockClear();
  names.delete('video_workspace_drafts');
  expect(() => handleDatabaseUpgrade(db, 14, DB_VERSION, transaction)).toThrow('unavailable');
  expect(transaction.abort).toHaveBeenCalledOnce();
  expect(put).not.toHaveBeenCalled();
});

it('requires a complete supported upgrade chain and rejects malformed persisted domain rows', () => {
  const plan = buildDatabaseMigrationPlan(1, 3);
  expect(
    plan?.map((migration) => [migration.fromDatabaseVersion, migration.toDatabaseVersion])
  ).toEqual([
    [1, 2],
    [2, 3],
  ]);
  expect(buildDatabaseMigrationPlan(2, 3)?.[0]?.domainVersions).toEqual([
    { domainId: 'scenarioProjects', from: 1, to: 2 },
  ]);
  expect(buildDatabaseMigrationPlan(0, 3)).toBeNull();
  for (const invalid of [
    null,
    [],
    {},
    { domainId: 'unknown', schemaVersion: 1 },
    { domainId: 'scenarioProjects', schemaVersion: 0 },
    { domainId: 'scenarioProjects', schemaVersion: 1.5 },
    { domainId: 'scenarioProjects', schemaVersion: '2' },
  ]) {
    expect(parseStoredSchemaContracts([invalid, ...CURRENT_SCHEMA_CONTRACTS.slice(1)])).toBeNull();
  }
});

it('admits speech without rewriting workspace history or the durable asset graph', async () => {
  const names = new Set<string>(betaV4Fixture.stores);
  const put = vi.fn();
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      return { createIndex: vi.fn(), put };
    }),
    deleteObjectStore: vi.fn(),
  };
  const transaction = {
    abort: vi.fn(),
    objectStore: vi.fn((_name: string) => ({
      put,
      createIndex: vi.fn(),
      clear: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    })),
  };
  names.delete('video_workspace_drafts');
  expect(() => handleDatabaseUpgrade(db, 4, DB_VERSION, transaction)).toThrow('unavailable');
  expect(transaction.abort).toHaveBeenCalledOnce();
  expect(put).not.toHaveBeenCalled();

  names.add('video_workspace_drafts');
  handleDatabaseUpgrade(db, 4, DB_VERSION, transaction);
  expect(db.createObjectStore.mock.calls).toEqual([
    ['video_workspace_history', { keyPath: ['aggregateId', 'ordinal'] }],
    ['scenario_project_history', { keyPath: ['projectId', 'revision'] }],
    ['scenario_project_units', { keyPath: ['projectId', 'unitId', 'revision'] }],
    ['recording_recovery_sessions', { keyPath: 'id' }],
    ['recording_recovery_blocks', { keyPath: ['id', 'index'] }],
  ]);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(transaction.objectStore.mock.calls).toEqual([
    ['video_projects'],
    ['video_workspaces'],
    ['project_assets'],
    ['scenario_assets'],
    [SCHEMA_CONTRACTS_STORE],
  ]);
  expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  const plan = buildDatabaseMigrationPlan(4, DB_VERSION)!;
  expect(plan).toHaveLength(DB_VERSION - 4);
  expect(plan[0]?.domainVersions).toEqual([{ domainId: 'mediaLibrary', from: 3, to: 4 }]);
  expect(await plan[0]?.estimateAdditionalBytes()).toBe(64 * 1024);
  expect(plan[0]?.risk).toBe('additive');
  expect(buildDatabaseMigrationPlan(DB_VERSION, 4)).toBeNull();
  expect(buildDatabaseMigrationPlan(1, DB_VERSION)).toHaveLength(DB_VERSION - 1);
});

it('upgrades each retained source contract only after all required stores validate', async () => {
  for (const migration of buildDatabaseMigrationPlan(1, DB_VERSION)!) {
    const names = new Set<string>(
      SUPPORTED_BETA_DATABASE_FIXTURES.find(
        (fixture) => fixture.databaseVersion === migration.fromDatabaseVersion
      )!.stores
    );
    const createIndex = vi.fn();
    const db = {
      objectStoreNames: { contains: (name: string) => names.has(name) },
      createObjectStore: vi.fn((name: string) => {
        names.add(name);
        return { createIndex, put: vi.fn() };
      }),
      deleteObjectStore: vi.fn(),
    };
    const transaction = {
      abort: vi.fn(),
      objectStore: vi.fn(() => ({
        createIndex,
        put: vi.fn(),
        clear: vi.fn(),
        delete: vi.fn(),
        getAll: vi.fn(),
      })),
    };
    expect(migration.migrate(db, transaction)).toBeUndefined();
    expect(migration.validate(db, transaction)).toBeUndefined();
    expect(await migration.estimateAdditionalBytes(await openDB('test'))).toBe(64 * 1024);
    if (migration.fromDatabaseVersion === 1) {
      expect(db.createObjectStore.mock.calls.map(([name]) => name)).toEqual([
        'video_workspaces',
        'video_workspace_drafts',
      ]);
      expect(createIndex).toHaveBeenCalledWith('updatedAt', 'updatedAt');
    } else if (migration.fromDatabaseVersion === 17)
      expect(db.createObjectStore).toHaveBeenCalledExactlyOnceWith('video_workspace_history', {
        keyPath: ['aggregateId', 'ordinal'],
      });
    else if (migration.fromDatabaseVersion === 18)
      expect(db.createObjectStore).toHaveBeenCalledExactlyOnceWith('scenario_project_history', {
        keyPath: ['projectId', 'revision'],
      });
    else if (migration.fromDatabaseVersion === 19)
      expect(db.createObjectStore).toHaveBeenCalledExactlyOnceWith('scenario_project_units', {
        keyPath: ['projectId', 'unitId', 'revision'],
      });
    else if (migration.fromDatabaseVersion === 32)
      expect(db.createObjectStore.mock.calls).toEqual([
        ['recording_recovery_sessions', { keyPath: 'id' }],
        ['recording_recovery_blocks', { keyPath: ['id', 'index'] }],
      ]);
    else expect(db.createObjectStore).not.toHaveBeenCalled();
    names.clear();
    expect(() => migration.validate(db, transaction)).toThrow();
    expect(db.deleteObjectStore).not.toHaveBeenCalled();
  }
});

it('admits compact source gain without workspace migration and refuses incompatible contracts', () => {
  expect(betaV17Fixture.records).toEqual(betaV16Fixture.records);
  expect(betaV17Fixture.opfsObjects).toEqual(betaV16Fixture.opfsObjects);
  const plan = buildDatabaseMigrationPlan(16, DB_VERSION);
  expect(plan).toHaveLength(DB_VERSION - 16);
  expect(plan?.[0]?.domainVersions).toEqual([{ domainId: 'mediaLibrary', from: 15, to: 16 }]);
  const put = vi.fn();
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({ put, clear: vi.fn(), delete: vi.fn(), getAll: vi.fn() })),
  };
  const names = new Set<string>(betaV16Fixture.stores);
  const db = {
    objectStoreNames: {
      contains: (name: string) => names.has(name),
    },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      return { createIndex: vi.fn(), put };
    }),
    deleteObjectStore: vi.fn(),
  };
  handleDatabaseUpgrade(db, 16, DB_VERSION, tx);
  expect(tx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  expect(put.mock.calls.map(([row]) => row)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(db.createObjectStore.mock.calls).toEqual([
    ['video_workspace_history', { keyPath: ['aggregateId', 'ordinal'] }],
    ['scenario_project_history', { keyPath: ['projectId', 'revision'] }],
    ['scenario_project_units', { keyPath: ['projectId', 'unitId', 'revision'] }],
    ['recording_recovery_sessions', { keyPath: 'id' }],
    ['recording_recovery_blocks', { keyPath: ['id', 'index'] }],
  ]);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(
    parseStoredSchemaContracts(
      Object.entries(betaV16Fixture.domainVersions).map(([domainId, schemaVersion]) => ({
        domainId,
        schemaVersion,
      }))
    )
  ).toBeNull();
  expect(buildDatabaseMigrationPlan(DB_VERSION, 16)).toBeNull();
});

it('annotation admission preserves rows and aborts before publishing contracts on missing storage', async () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 20
  )!;
  const names = new Set(source.stores);
  const put = vi.fn();
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn((_name: string) => ({
      put,
      clear: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    })),
  };
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      return { createIndex: vi.fn(), put };
    }),
    deleteObjectStore: vi.fn(),
  };
  const plan = buildDatabaseMigrationPlan(20, DB_VERSION)!;
  expect(plan).toHaveLength(DB_VERSION - 20);
  expect(plan[0]).toMatchObject({
    risk: 'additive',
    fromDatabaseVersion: 20,
    toDatabaseVersion: 21,
    domainVersions: [{ domainId: 'mediaLibrary', from: 17, to: 18 }],
  });
  await expect(plan[0]!.estimateAdditionalBytes()).resolves.toBe(65536);
  handleDatabaseUpgrade(db, 20, DB_VERSION, tx);
  expect(db.createObjectStore.mock.calls).toEqual([
    ['recording_recovery_sessions', { keyPath: 'id' }],
    ['recording_recovery_blocks', { keyPath: ['id', 'index'] }],
  ]);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  expect(put.mock.calls.map(([row]) => row)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  put.mockClear();
  tx.objectStore.mockClear();
  names.delete('video_workspace_history');
  expect(() => handleDatabaseUpgrade(db, 20, DB_VERSION, tx)).toThrow('Annotation effect');
  expect(tx.abort).toHaveBeenCalledOnce();
  expect(tx.objectStore).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
});

it('admits interaction authoring and rhythm without rewriting released media or document rows', async () => {
  const step = DATABASE_MIGRATIONS.find((migration) => migration.fromDatabaseVersion === 26);
  expect(step).toBeDefined();
  if (!step) return;
  const released = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 26
  )!;
  const names = new Set<string>(released.stores);
  const mutateRows = vi.fn();
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn(() => ({ createIndex: vi.fn(), put: mutateRows })),
    deleteObjectStore: vi.fn(),
  };
  const transaction = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({
      put: mutateRows,
      clear: mutateRows,
      delete: mutateRows,
      getAll: vi.fn(),
    })),
  };
  expect(step.risk).toBe('additive');
  expect(step.migrate(db, transaction)).toBeUndefined();
  expect(step.validate(db, transaction)).toBeUndefined();
  expect(transaction.objectStore).not.toHaveBeenCalled();
  expect(mutateRows).not.toHaveBeenCalled();
  expect(await step.estimateAdditionalBytes()).toBeGreaterThanOrEqual(64 * 1024);
  expect(step.domainVersions.map(({ domainId }) => domainId).sort()).toEqual([
    'mediaLibrary',
    'recordings',
    'videoProjects',
  ]);
  const olderContracts = Object.entries(released.domainVersions).map(
    ([domainId, schemaVersion]) => ({ domainId, schemaVersion })
  );
  expect(parseStoredSchemaContracts(olderContracts)).toBeNull();
  names.delete('recording_telemetry');
  expect(() => step.validate(db, transaction)).toThrow('unavailable');
});
