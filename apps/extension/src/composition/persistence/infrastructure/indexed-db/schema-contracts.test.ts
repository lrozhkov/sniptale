import { SUPPORTED_BETA_DATABASE_FIXTURES } from './fixtures';
import { openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { DB_VERSION, EXPECTED_STORES, SCHEMA_CONTRACTS_STORE } from './core.stores.ts';
import { executeDatabaseUpgrade, handleDatabaseUpgrade } from './upgrade/core';
import { betaV4Fixture } from './fixtures/beta-v4';
import { betaV14Fixture } from './fixtures/beta-v14';
import { betaV16Fixture } from './fixtures/beta-v16';
import { betaV17Fixture } from './fixtures/beta-v17';
import { betaV42Fixture } from './fixtures/beta-v42';
import { betaV43Fixture } from './fixtures/beta-v43';
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
      createIndex: vi.fn(),
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
  expect(transaction.objectStore.mock.calls).toEqual([['sync_outbox'], [SCHEMA_CONTRACTS_STORE]]);
  expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(db.createObjectStore.mock.calls).toEqual([
    ['video_workspace_history', { keyPath: ['aggregateId', 'ordinal'] }],
    ['scenario_project_history', { keyPath: ['projectId', 'revision'] }],
    ['scenario_project_units', { keyPath: ['projectId', 'unitId', 'revision'] }],
    ['recording_recovery_sessions', { keyPath: 'id' }],
    ['recording_recovery_blocks', { keyPath: ['id', 'index'] }],
    ['voice_input_history', { keyPath: 'id' }],
    ['sync_capture', { keyPath: 'key' }],
    ['video_project_revisions', { keyPath: 'projectId' }],
    ['sync_outbox', { keyPath: 'key' }],
    ['sync_catalog_cache', { keyPath: 'key' }],
    ['sync_connection', { keyPath: 'key' }],
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
    ['voice_input_history', { keyPath: 'id' }],
    ['sync_capture', { keyPath: 'key' }],
    ['video_project_revisions', { keyPath: 'projectId' }],
    ['sync_outbox', { keyPath: 'key' }],
    ['sync_catalog_cache', { keyPath: 'key' }],
    ['sync_connection', { keyPath: 'key' }],
  ]);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(transaction.objectStore.mock.calls).toEqual([
    ['video_projects'],
    ['video_workspaces'],
    ['project_assets'],
    ['scenario_assets'],
    ['sync_outbox'],
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
    else if (migration.fromDatabaseVersion === 34)
      expect(db.createObjectStore.mock.calls).toEqual([['voice_input_history', { keyPath: 'id' }]]);
    else if (migration.fromDatabaseVersion === 39)
      expect(db.createObjectStore.mock.calls).toEqual([
        ['sync_capture', { keyPath: 'key' }],
        ['video_project_revisions', { keyPath: 'projectId' }],
      ]);
    else if (migration.fromDatabaseVersion === 40)
      expect(db.createObjectStore.mock.calls).toEqual([['sync_outbox', { keyPath: 'key' }]]);
    else if (migration.fromDatabaseVersion === 41)
      expect(db.createObjectStore.mock.calls).toEqual([['sync_catalog_cache', { keyPath: 'key' }]]);
    else if (migration.fromDatabaseVersion === 43)
      expect(db.createObjectStore.mock.calls).toEqual([['sync_connection', { keyPath: 'key' }]]);
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
    objectStore: vi.fn(() => ({
      createIndex: vi.fn(),
      put,
      clear: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    })),
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
  expect(tx.objectStore.mock.calls).toEqual([['sync_outbox'], [SCHEMA_CONTRACTS_STORE]]);
  expect(put.mock.calls.map(([row]) => row)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(db.createObjectStore.mock.calls).toEqual([
    ['video_workspace_history', { keyPath: ['aggregateId', 'ordinal'] }],
    ['scenario_project_history', { keyPath: ['projectId', 'revision'] }],
    ['scenario_project_units', { keyPath: ['projectId', 'unitId', 'revision'] }],
    ['recording_recovery_sessions', { keyPath: 'id' }],
    ['recording_recovery_blocks', { keyPath: ['id', 'index'] }],
    ['voice_input_history', { keyPath: 'id' }],
    ['sync_capture', { keyPath: 'key' }],
    ['video_project_revisions', { keyPath: 'projectId' }],
    ['sync_outbox', { keyPath: 'key' }],
    ['sync_catalog_cache', { keyPath: 'key' }],
    ['sync_connection', { keyPath: 'key' }],
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
      createIndex: vi.fn(),
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
    ['voice_input_history', { keyPath: 'id' }],
    ['sync_capture', { keyPath: 'key' }],
    ['video_project_revisions', { keyPath: 'projectId' }],
    ['sync_outbox', { keyPath: 'key' }],
    ['sync_catalog_cache', { keyPath: 'key' }],
    ['sync_connection', { keyPath: 'key' }],
  ]);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.objectStore.mock.calls).toEqual([['sync_outbox'], [SCHEMA_CONTRACTS_STORE]]);
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

it.each([
  [21, 'PCM speech workspace stores are unavailable.'],
  [22, 'Action audio workspace stores are unavailable.'],
  [28, 'Review project metadata stores are unavailable.'],
  [29, 'Source crop workspace stores are unavailable.'],
  [30, 'Workspace color stores are unavailable.'],
  [31, 'Track control stores are unavailable.'],
  [35, 'Quick project stores are unavailable.'],
  [36, 'Camera project stores are unavailable.'],
  [37, 'Camera project stores are unavailable.'],
  [38, 'Camera project stores are unavailable.'],
] as const)(
  'preserves released migration %i admission and its exact missing-store diagnostic',
  (from, diagnostic) => {
    const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === from)!;
    const names = new Set<string>(migration.stores);
    const db = {
      objectStoreNames: { contains: (name: string) => names.has(name) },
      createObjectStore: vi.fn(() => ({ createIndex: vi.fn(), put: vi.fn() })),
      deleteObjectStore: vi.fn(),
    };
    const transaction = {
      abort: vi.fn(),
      objectStore: vi.fn(),
    };
    expect(migration.toDatabaseVersion).toBe(from + 1);
    expect(migration.risk).toBe('additive');
    expect(migration.backupCoverage).toBe('none');
    expect(migration.validate(db, transaction)).toBeUndefined();
    for (const name of migration.stores) {
      names.delete(name);
      transaction.abort.mockClear();
      expect(() => migration.validate(db, transaction)).toThrow(new Error(diagnostic));
      expect(() => executeDatabaseUpgrade(db, from, from + 1, transaction, [migration])).toThrow(
        new Error(diagnostic)
      );
      expect(transaction.abort).toHaveBeenCalledOnce();
      expect(transaction.objectStore).not.toHaveBeenCalled();
      expect(db.createObjectStore).not.toHaveBeenCalled();
      expect(db.deleteObjectStore).not.toHaveBeenCalled();
      names.add(name);
    }
    expect(migration.validate(db, transaction)).toBeUndefined();
  }
);

it('publishes queue control contracts without reading or rewriting version 42 native data', () => {
  const names = new Set<string>(betaV42Fixture.stores);
  const nativeRows = new Map<string, readonly unknown[]>(Object.entries(betaV42Fixture.records));
  nativeRows.set('sync_capture', [{ key: 'profile', retained: 'capture profile and intent' }]);
  nativeRows.set('sync_outbox', [
    { key: 'prepared', retained: 'preparation bytes and source claims' },
    { key: 'attempt', retained: 'attempts and checked-file evidence' },
  ]);
  nativeRows.set('sync_catalog_cache', [{ key: 'catalog', retained: 'advisory evidence' }]);
  const before = structuredClone(nativeRows);
  const put = vi.fn();
  const sourceAccess = vi.fn(() => {
    throw new Error('Released native data must remain untouched.');
  });
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: sourceAccess,
    deleteObjectStore: sourceAccess,
  };
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn((name: string) => {
      if (name !== SCHEMA_CONTRACTS_STORE) return sourceAccess();
      return { put, getAll: sourceAccess, clear: sourceAccess, delete: sourceAccess };
    }),
  };
  const plan = buildDatabaseMigrationPlan(42, 43)!;
  expect(plan).toHaveLength(1);
  expect(plan[0]?.domainVersions).toEqual([{ domainId: 'syncCapture', from: 3, to: 4 }]);
  handleDatabaseUpgrade(db, 42, 43, tx);
  expect(tx.abort).not.toHaveBeenCalled();
  expect(tx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(nativeRows).toEqual(before);
  expect([...names]).toEqual(betaV42Fixture.stores);
  expect(sourceAccess).not.toHaveBeenCalled();
  expect(
    parseStoredSchemaContracts(
      Object.entries(betaV42Fixture.domainVersions).map(([domainId, schemaVersion]) => ({
        domainId,
        schemaVersion,
      }))
    )
  ).toBeNull();
  expect(buildDatabaseMigrationPlan(DB_VERSION, 42)).toBeNull();
});

it.each(['sync_capture', 'sync_outbox', 'sync_catalog_cache'])(
  'aborts queue admission without publishing contracts when %s is missing and permits retry',
  (missingStore) => {
    const names = new Set<string>(betaV42Fixture.stores);
    names.delete(missingStore);
    const put = vi.fn();
    const sourceAccess = vi.fn(() => {
      throw new Error('Queue admission must not change native stores.');
    });
    const db = {
      objectStoreNames: { contains: (name: string) => names.has(name) },
      createObjectStore: sourceAccess,
      deleteObjectStore: sourceAccess,
    };
    const failedTx = {
      abort: vi.fn(),
      objectStore: vi.fn(() => ({
        createIndex: vi.fn(),
        put,
        clear: vi.fn(),
        delete: vi.fn(),
        getAll: vi.fn(),
      })),
    };
    expect(() => handleDatabaseUpgrade(db, 42, 43, failedTx)).toThrow(
      'Sync queue control stores are unavailable.'
    );
    expect(failedTx.abort).toHaveBeenCalledOnce();
    expect(failedTx.objectStore).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    names.add(missingStore);
    const retryTx = {
      abort: vi.fn(),
      objectStore: vi.fn(() => ({
        createIndex: vi.fn(),
        put,
        clear: vi.fn(),
        delete: vi.fn(),
        getAll: vi.fn(),
      })),
    };
    handleDatabaseUpgrade(db, 42, 43, retryTx);
    expect(retryTx.abort).not.toHaveBeenCalled();
    expect(retryTx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
    expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
    expect(sourceAccess).not.toHaveBeenCalled();
  }
);

it('creates the complete fresh schema with empty unindexed connection authority', () => {
  const names: string[] = [];
  const put = vi.fn();
  const connectionIndex = vi.fn();
  const connectionPut = vi.fn();
  const db = {
    objectStoreNames: { contains: (name: string) => names.includes(name) },
    createObjectStore: vi.fn((name: string) => {
      names.push(name);
      return {
        createIndex: name === 'sync_connection' ? connectionIndex : vi.fn(),
        put: name === 'sync_connection' ? connectionPut : put,
      };
    }),
    deleteObjectStore: vi.fn(),
  };
  const tx = { abort: vi.fn(), objectStore: vi.fn() };
  handleDatabaseUpgrade(db, 0, DB_VERSION, tx);
  expect([...names].sort()).toEqual([...EXPECTED_STORES].sort());
  expect(names).toHaveLength(41);
  expect(db.createObjectStore).toHaveBeenCalledWith('sync_connection', { keyPath: 'key' });
  expect(connectionIndex).not.toHaveBeenCalled();
  expect(connectionPut).not.toHaveBeenCalled();
  expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(tx.objectStore).not.toHaveBeenCalled();
  expect(tx.abort).not.toHaveBeenCalled();
});

it('adds connection authority without reading or rewriting populated version 43 native data', () => {
  const names = new Set<string>(betaV43Fixture.stores);
  const nativeRows = new Map<string, readonly unknown[]>(Object.entries(betaV43Fixture.records));
  nativeRows.set('sync_capture', [{ key: 'profile', enabled: true, connectionGeneration: 7 }]);
  nativeRows.set('sync_outbox', [
    { key: 'prepared', retained: 'source claims and immutable bytes' },
    { key: 'queue', retained: 'legacy run without auth identity' },
    { key: 'attempt', retained: 'attempt and receipt evidence' },
  ]);
  nativeRows.set('sync_catalog_cache', [{ key: 'catalog', retained: 'advisory evidence' }]);
  const before = structuredClone(nativeRows);
  const put = vi.fn();
  const sourceAccess = vi.fn(() => {
    throw new Error('Released native data must remain untouched.');
  });
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      nativeRows.set(name, []);
      return { createIndex: sourceAccess, put: sourceAccess };
    }),
    deleteObjectStore: sourceAccess,
  };
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn((name: string) => {
      if (name !== SCHEMA_CONTRACTS_STORE) return sourceAccess();
      return { put, getAll: sourceAccess, clear: sourceAccess, delete: sourceAccess };
    }),
  };
  expect(buildDatabaseMigrationPlan(43, 44)).toHaveLength(1);
  handleDatabaseUpgrade(db, 43, 44, tx);
  expect(db.createObjectStore).toHaveBeenCalledExactlyOnceWith('sync_connection', {
    keyPath: 'key',
  });
  expect(nativeRows).toEqual(new Map([...before, ['sync_connection', []]]));
  expect(tx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(tx.abort).not.toHaveBeenCalled();
  expect(sourceAccess).not.toHaveBeenCalled();
  expect(
    parseStoredSchemaContracts(
      Object.entries(betaV43Fixture.domainVersions).map(([domainId, schemaVersion]) => ({
        domainId,
        schemaVersion,
      }))
    )
  ).toBeNull();
  expect(buildDatabaseMigrationPlan(DB_VERSION, 43)).toBeNull();
});

it.each(['sync_capture', 'sync_outbox', 'sync_catalog_cache', 'sync_connection'])(
  'aborts connection admission before publishing contracts when %s is unavailable and permits retry',
  (missingStore) => {
    const names = new Set<string>(betaV43Fixture.stores);
    names.delete(missingStore);
    const put = vi.fn();
    const sourceAccess = vi.fn(() => {
      throw new Error('Connection admission must not access native rows.');
    });
    let creationInterrupted = missingStore === 'sync_connection';
    const db = {
      objectStoreNames: { contains: (name: string) => names.has(name) },
      createObjectStore: vi.fn((name: string) => {
        if (!creationInterrupted) names.add(name);
        return { createIndex: sourceAccess, put: sourceAccess };
      }),
      deleteObjectStore: sourceAccess,
    };
    const failedTx = {
      abort: vi.fn(),
      objectStore: vi.fn(() => ({
        createIndex: vi.fn(),
        put,
        clear: vi.fn(),
        delete: vi.fn(),
        getAll: vi.fn(),
      })),
    };
    expect(() => handleDatabaseUpgrade(db, 43, 44, failedTx)).toThrow(
      'Sync connection stores are unavailable.'
    );
    expect(failedTx.abort).toHaveBeenCalledOnce();
    expect(failedTx.objectStore).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    // IndexedDB abort rolls back the new store before the next upgrade attempt.
    names.delete('sync_connection');
    if (missingStore !== 'sync_connection') names.add(missingStore);
    creationInterrupted = false;
    const retryTx = {
      abort: vi.fn(),
      objectStore: vi.fn(() => ({
        createIndex: vi.fn(),
        put,
        clear: vi.fn(),
        delete: vi.fn(),
        getAll: vi.fn(),
      })),
    };
    handleDatabaseUpgrade(db, 43, 44, retryTx);
    expect(retryTx.abort).not.toHaveBeenCalled();
    expect(retryTx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
    expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
    expect(sourceAccess).not.toHaveBeenCalled();
  }
);

it('adds the exact nonunique due index synchronously without reading or backfilling version 44 rows', () => {
  const createIndex = vi.fn();
  const sourceAccess = vi.fn(() => {
    throw new Error('Due indexing must not read or change source rows.');
  });
  const put = vi.fn();
  const db = {
    objectStoreNames: {
      contains: (name: string) => EXPECTED_STORES.some((store) => store === name),
    },
    createObjectStore: sourceAccess,
    deleteObjectStore: sourceAccess,
  };
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn((name: string) => ({
      createIndex,
      put: name === SCHEMA_CONTRACTS_STORE ? put : sourceAccess,
      clear: sourceAccess,
      delete: sourceAccess,
      getAll: sourceAccess,
    })),
  };
  expect(handleDatabaseUpgrade(db, 44, DB_VERSION, tx)).toBeUndefined();
  expect(tx.objectStore.mock.calls).toEqual([['sync_outbox'], [SCHEMA_CONTRACTS_STORE]]);
  expect(createIndex).toHaveBeenCalledExactlyOnceWith(
    'syncQueueDue',
    [
      'spaceId',
      'connectionGeneration',
      'profileCreatedAt',
      'authorization.incarnation',
      'nextDueAt',
      'key',
    ],
    { unique: false }
  );
  expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(sourceAccess).not.toHaveBeenCalled();
  expect(tx.abort).not.toHaveBeenCalled();
});

it('aborts due index creation failure before publishing contracts and permits a fresh upgrade attempt', () => {
  const createIndex = vi.fn(() => {
    throw new Error('Interrupted due index creation');
  });
  const put = vi.fn();
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: vi.fn(() => ({ createIndex, put })),
    deleteObjectStore: vi.fn(),
  };
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({
      createIndex,
      put,
      clear: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    })),
  };
  expect(() => handleDatabaseUpgrade(db, 44, DB_VERSION, tx)).toThrow(
    'Interrupted due index creation'
  );
  expect(tx.abort).toHaveBeenCalledOnce();
  expect(put).not.toHaveBeenCalled();
  expect(tx.objectStore.mock.calls).toEqual([['sync_outbox']]);
  const retryIndex = vi.fn();
  const retryTx = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({
      createIndex: retryIndex,
      put,
      clear: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    })),
  };
  handleDatabaseUpgrade(db, 44, DB_VERSION, retryTx);
  expect(retryIndex).toHaveBeenCalledOnce();
  expect(put.mock.calls.map(([value]) => value)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(retryTx.abort).not.toHaveBeenCalled();
  expect(db.createObjectStore).not.toHaveBeenCalled();
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
});

it('creates the same exact nonunique due index for a fresh database', () => {
  const dueIndex = vi.fn();
  const put = vi.fn();
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn((name: string) => ({
      createIndex: name === 'sync_outbox' ? dueIndex : vi.fn(),
      put,
    })),
    deleteObjectStore: vi.fn(),
  };
  const tx = { abort: vi.fn(), objectStore: vi.fn() };
  handleDatabaseUpgrade(db, 0, DB_VERSION, tx);
  expect(dueIndex).toHaveBeenCalledExactlyOnceWith(
    'syncQueueDue',
    [
      'spaceId',
      'connectionGeneration',
      'profileCreatedAt',
      'authorization.incarnation',
      'nextDueAt',
      'key',
    ],
    { unique: false }
  );
  expect(tx.objectStore).not.toHaveBeenCalled();
});
