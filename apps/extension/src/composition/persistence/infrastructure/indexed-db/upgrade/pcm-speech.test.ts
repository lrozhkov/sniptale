import { expect, it, vi } from 'vitest';
import { DB_VERSION, SCHEMA_CONTRACTS_STORE } from '../core.stores';
import { betaV21Fixture } from '../fixtures/beta-v21';
import { betaV22Fixture } from '../fixtures/beta-v22';
import { betaV23Fixture } from '../fixtures/beta-v23';
import {
  buildDatabaseMigrationPlan,
  CURRENT_SCHEMA_CONTRACTS,
  parseStoredSchemaContracts,
} from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';

/** Versionchange adapter models rollback of a late schema publication failure. */
function upgradeFixture(
  failAt = Infinity,
  released: typeof betaV21Fixture | typeof betaV22Fixture | typeof betaV23Fixture = betaV21Fixture
) {
  const names = new Set<string>(released.stores);
  const durable = structuredClone({
    records: released.records,
    objects: released.opfsObjects,
  });
  let committed = new Map<string, unknown>(
    Object.entries(released.domainVersions).map(([domainId, schemaVersion]) => [
      domainId,
      { domainId, schemaVersion },
    ])
  );
  let pending = structuredClone(committed);
  let aborted = false;
  let writes = 0;
  const unsupported = () => {
    throw new Error('Unexpected durable mutation');
  };
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn(unsupported),
    deleteObjectStore: vi.fn(unsupported),
  };
  const tx = {
    abort: vi.fn(() => {
      aborted = true;
      pending = structuredClone(committed);
    }),
    objectStore: vi.fn((name: string) => {
      if (name !== SCHEMA_CONTRACTS_STORE) throw new Error('Unexpected durable store access');
      return {
        clear: vi.fn(unsupported),
        delete: vi.fn(unsupported),
        getAll: vi.fn(unsupported),
        put(value: unknown) {
          if (++writes === failAt) throw new DOMException('Interrupted', 'AbortError');
          if (
            typeof value !== 'object' ||
            value === null ||
            !('domainId' in value) ||
            typeof value.domainId !== 'string'
          )
            throw new Error('Invalid schema fixture');
          pending.set(value.domainId, structuredClone(value));
        },
      };
    }),
  };
  return {
    names,
    durable,
    db,
    tx,
    contracts: () => [...committed.values()],
    commit() {
      if (aborted) throw new DOMException('Aborted', 'AbortError');
      committed = structuredClone(pending);
    },
    retry() {
      aborted = false;
      writes = 0;
      failAt = Infinity;
      pending = structuredClone(committed);
    },
  };
}

it.each([Infinity, 3])(
  'admits action audio from physical 22 without row rewrites after publication interruption %s',
  (failAt) => {
    const fixture = upgradeFixture(failAt, betaV22Fixture);
    const before = structuredClone(fixture.durable);
    const oldContracts = fixture.contracts();
    const plan = buildDatabaseMigrationPlan(22, 23)!;
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      risk: 'additive',
      backupCoverage: 'none',
      domainVersions: [{ domainId: 'mediaLibrary', from: 19, to: 20 }],
    });
    if (failAt !== Infinity) {
      expect(() => handleDatabaseUpgrade(fixture.db, 22, 23, fixture.tx)).toThrow('Interrupted');
      expect(fixture.contracts()).toEqual(oldContracts);
      expect(fixture.durable).toEqual(before);
      fixture.retry();
    }
    handleDatabaseUpgrade(fixture.db, 22, 23, fixture.tx);
    fixture.commit();
    expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
    expect(fixture.durable).toEqual(before);
    expect(fixture.db.createObjectStore).not.toHaveBeenCalled();
    expect(fixture.db.deleteObjectStore).not.toHaveBeenCalled();
  }
);

it.each([Infinity, 3])(
  'admits complete baseline and grouped history from23 with atomic schema publication %s',
  (failAt) => {
    const fixture = upgradeFixture(failAt, betaV23Fixture);
    const before = structuredClone(fixture.durable);
    const oldContracts = fixture.contracts();
    expect(buildDatabaseMigrationPlan(23, 24)).toMatchObject([
      {
        risk: 'additive',
        backupCoverage: 'none',
        domainVersions: [
          { domainId: 'mediaLibrary', from: 20, to: 21 },
          { domainId: 'scenarioProjects', from: 6, to: 7 },
        ],
      },
    ]);
    if (failAt !== Infinity) {
      expect(() => handleDatabaseUpgrade(fixture.db, 23, 24, fixture.tx)).toThrow('Interrupted');
      expect(fixture.contracts()).toEqual(oldContracts);
      expect(fixture.durable).toEqual(before);
      fixture.retry();
    }
    handleDatabaseUpgrade(fixture.db, 23, 24, fixture.tx);
    fixture.commit();
    expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
    expect(fixture.durable).toEqual(before);
    expect(fixture.db.createObjectStore).not.toHaveBeenCalled();
    expect(fixture.db.deleteObjectStore).not.toHaveBeenCalled();
  }
);

it('admits PCM speech content with one additive step and leaves rows and object bytes untouched', async () => {
  const fixture = upgradeFixture();
  const before = structuredClone(fixture.durable);
  const plan = buildDatabaseMigrationPlan(21, 22)!;
  expect(DB_VERSION).toBeGreaterThanOrEqual(22);
  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({
    fromDatabaseVersion: 21,
    toDatabaseVersion: 22,
    risk: 'additive',
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 18, to: 19 }],
    stores: ['video_workspaces', 'video_workspace_history', 'video_workspace_drafts'],
  });
  expect(await plan[0]!.estimateAdditionalBytes()).toBe(64 * 1024);
  handleDatabaseUpgrade(fixture.db, 21, 22, fixture.tx);
  fixture.commit();
  expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
  expect(fixture.durable).toEqual(before);
  expect(fixture.db.createObjectStore).not.toHaveBeenCalled();
  expect(fixture.db.deleteObjectStore).not.toHaveBeenCalled();
  expect(fixture.tx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  fixture.retry();
  handleDatabaseUpgrade(fixture.db, 22, 22, fixture.tx);
  fixture.commit();
  expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
  expect(fixture.durable).toEqual(before);
});

it.each(['video_workspaces', 'video_workspace_history', 'video_workspace_drafts'])(
  'refuses a missing %s before publishing contracts and permits a complete retry',
  (missing) => {
    const fixture = upgradeFixture();
    const contracts = fixture.contracts();
    const before = structuredClone(fixture.durable);
    fixture.names.delete(missing);
    expect(() => handleDatabaseUpgrade(fixture.db, 21, 22, fixture.tx)).toThrow('unavailable');
    expect(fixture.tx.abort).toHaveBeenCalledOnce();
    expect(fixture.tx.objectStore).not.toHaveBeenCalled();
    expect(fixture.contracts()).toEqual(contracts);
    expect(fixture.durable).toEqual(before);
    fixture.names.add(missing);
    fixture.retry();
    handleDatabaseUpgrade(fixture.db, 21, 22, fixture.tx);
    fixture.commit();
    expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
  }
);

it('rolls back interrupted contract publication and reruns without partial domain admission', () => {
  const fixture = upgradeFixture(3);
  const contracts = fixture.contracts();
  const before = structuredClone(fixture.durable);
  expect(() => handleDatabaseUpgrade(fixture.db, 21, 22, fixture.tx)).toThrow('Interrupted');
  expect(fixture.tx.abort).toHaveBeenCalledOnce();
  expect(() => fixture.commit()).toThrow('Aborted');
  expect(fixture.contracts()).toEqual(contracts);
  expect(fixture.durable).toEqual(before);
  fixture.retry();
  handleDatabaseUpgrade(fixture.db, 21, 22, fixture.tx);
  fixture.commit();
  expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
  expect(fixture.durable).toEqual(before);
});

it.each([
  [6, 5],
  [7, 6],
  [DB_VERSION, DB_VERSION + 1],
])('refuses unsupported or reverse migration %i to %i before mutation', (from, to) => {
  const fixture = upgradeFixture();
  const contracts = fixture.contracts();
  expect(() => handleDatabaseUpgrade(fixture.db, from, to, fixture.tx)).toThrow('Unsupported');
  expect(fixture.tx.abort).toHaveBeenCalledOnce();
  expect(fixture.tx.objectStore).not.toHaveBeenCalled();
  expect(fixture.db.createObjectStore).not.toHaveBeenCalled();
  expect(fixture.contracts()).toEqual(contracts);
});

it('requires the exact PCM speech domain contract at the current physical version', () => {
  expect(parseStoredSchemaContracts(CURRENT_SCHEMA_CONTRACTS)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  const current = CURRENT_SCHEMA_CONTRACTS.find(
    (contract) => contract.domainId === 'mediaLibrary'
  )!.schemaVersion;
  for (const schemaVersion of [current - 1, current + 1]) {
    const incompatible = CURRENT_SCHEMA_CONTRACTS.map((contract) =>
      contract.domainId === 'mediaLibrary' ? { ...contract, schemaVersion } : contract
    );
    expect(parseStoredSchemaContracts(incompatible)).toBeNull();
  }
});
