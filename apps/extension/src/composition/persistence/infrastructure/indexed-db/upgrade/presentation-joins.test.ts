import { expect, it, vi } from 'vitest';
import { DB_VERSION, SCHEMA_CONTRACTS_STORE } from '../core.stores';
import { betaV9Fixture } from '../fixtures/beta-v9';
import {
  buildDatabaseMigrationPlan,
  CURRENT_SCHEMA_CONTRACTS,
  parseStoredSchemaContracts,
} from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';

/** Versionchange adapter models rollback of a late schema publication failure. */
function upgradeFixture(failAt = Infinity) {
  const names = new Set<string>(betaV9Fixture.stores);
  const durable = structuredClone({
    records: betaV9Fixture.records,
    objects: betaV9Fixture.opfsObjects,
  });
  let committed = new Map<string, unknown>(
    CURRENT_SCHEMA_CONTRACTS.map(({ domainId }) => [
      domainId,
      { domainId, schemaVersion: betaV9Fixture.domainVersions[domainId] },
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

it('admits presentation join settings with one additive step and leaves rows and object bytes untouched', async () => {
  const fixture = upgradeFixture();
  const before = structuredClone(fixture.durable);
  const plan = buildDatabaseMigrationPlan(9, 10)!;
  expect(DB_VERSION).toBeGreaterThanOrEqual(10);
  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({
    fromDatabaseVersion: 9,
    toDatabaseVersion: 10,
    risk: 'additive',
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 8, to: 9 }],
    stores: ['video_workspaces', 'video_workspace_drafts'],
  });
  expect(await plan[0]!.estimateAdditionalBytes()).toBe(64 * 1024);
  handleDatabaseUpgrade(fixture.db, 9, 10, fixture.tx);
  fixture.commit();
  expect(fixture.contracts()).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(fixture.durable).toEqual(before);
  expect(fixture.db.createObjectStore).not.toHaveBeenCalled();
  expect(fixture.db.deleteObjectStore).not.toHaveBeenCalled();
  expect(fixture.tx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  fixture.retry();
  handleDatabaseUpgrade(fixture.db, 7, 7, fixture.tx);
  fixture.commit();
  expect(fixture.contracts()).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(fixture.durable).toEqual(before);
});

it.each(['video_workspaces', 'video_workspace_drafts'])(
  'refuses a missing %s before publishing contracts and permits a complete retry',
  (missing) => {
    const fixture = upgradeFixture();
    const contracts = fixture.contracts();
    const before = structuredClone(fixture.durable);
    fixture.names.delete(missing);
    expect(() => handleDatabaseUpgrade(fixture.db, 9, 10, fixture.tx)).toThrow('unavailable');
    expect(fixture.tx.abort).toHaveBeenCalledOnce();
    expect(fixture.tx.objectStore).not.toHaveBeenCalled();
    expect(fixture.contracts()).toEqual(contracts);
    expect(fixture.durable).toEqual(before);
    fixture.names.add(missing);
    fixture.retry();
    handleDatabaseUpgrade(fixture.db, 9, 10, fixture.tx);
    fixture.commit();
    expect(fixture.contracts()).toEqual(CURRENT_SCHEMA_CONTRACTS);
  }
);

it('rolls back interrupted contract publication and reruns without partial domain admission', () => {
  const fixture = upgradeFixture(3);
  const contracts = fixture.contracts();
  const before = structuredClone(fixture.durable);
  expect(() => handleDatabaseUpgrade(fixture.db, 9, 10, fixture.tx)).toThrow('Interrupted');
  expect(fixture.tx.abort).toHaveBeenCalledOnce();
  expect(() => fixture.commit()).toThrow('Aborted');
  expect(fixture.contracts()).toEqual(contracts);
  expect(fixture.durable).toEqual(before);
  fixture.retry();
  handleDatabaseUpgrade(fixture.db, 9, 10, fixture.tx);
  fixture.commit();
  expect(fixture.contracts()).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(fixture.durable).toEqual(before);
});

it.each([
  [9, 8],
  [10, 9],
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

it('requires the exact presentation domain contract at the current physical version', () => {
  expect(parseStoredSchemaContracts(CURRENT_SCHEMA_CONTRACTS)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  for (const schemaVersion of [9, 11]) {
    const incompatible = CURRENT_SCHEMA_CONTRACTS.map((contract) =>
      contract.domainId === 'mediaLibrary' ? { ...contract, schemaVersion } : contract
    );
    expect(parseStoredSchemaContracts(incompatible)).toBeNull();
  }
});

it('admits independent presentation edges without rewriting existing workspace history', async () => {
  const plan = buildDatabaseMigrationPlan(10, 11)!;
  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({
    fromDatabaseVersion: 10,
    toDatabaseVersion: 11,
    risk: 'additive',
    domainVersions: [{ domainId: 'mediaLibrary', from: 9, to: 10 }],
  });
  const fixture = upgradeFixture();
  const before = structuredClone(fixture.durable);
  handleDatabaseUpgrade(fixture.db, 10, 11, fixture.tx);
  fixture.commit();
  expect(fixture.contracts()).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(fixture.durable).toEqual(before);
});
