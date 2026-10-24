import { expect, it, vi } from 'vitest';
import { DB_VERSION, SCHEMA_CONTRACTS_STORE } from '../core.stores';
import { betaV6Fixture } from '../fixtures/beta-v6';
import {
  buildDatabaseMigrationPlan,
  CURRENT_SCHEMA_CONTRACTS,
  parseStoredSchemaContracts,
} from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';

/** Versionchange adapter models rollback of a late schema publication failure. */
function upgradeFixture(failAt = Infinity) {
  const names = new Set<string>(betaV6Fixture.stores);
  const durable = structuredClone({
    records: betaV6Fixture.records,
    objects: betaV6Fixture.opfsObjects,
  });
  let committed = new Map<string, unknown>(
    Object.entries(betaV6Fixture.domainVersions).map(([domainId, schemaVersion]) => [
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

it('admits presentation content with one additive step and leaves rows and object bytes untouched', async () => {
  const fixture = upgradeFixture();
  const before = structuredClone(fixture.durable);
  const plan = buildDatabaseMigrationPlan(6, 7)!;
  expect(DB_VERSION).toBeGreaterThanOrEqual(7);
  expect(plan).toHaveLength(1);
  expect(plan[0]).toMatchObject({
    fromDatabaseVersion: 6,
    toDatabaseVersion: 7,
    risk: 'additive',
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'mediaLibrary', from: 5, to: 6 }],
    stores: ['video_workspaces', 'video_workspace_drafts'],
  });
  expect(await plan[0]!.estimateAdditionalBytes()).toBe(64 * 1024);
  handleDatabaseUpgrade(fixture.db, 6, 7, fixture.tx);
  fixture.commit();
  expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
  expect(fixture.durable).toEqual(before);
  expect(fixture.db.createObjectStore).not.toHaveBeenCalled();
  expect(fixture.db.deleteObjectStore).not.toHaveBeenCalled();
  expect(fixture.tx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  fixture.retry();
  handleDatabaseUpgrade(fixture.db, 7, 7, fixture.tx);
  fixture.commit();
  expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
  expect(fixture.durable).toEqual(before);
});

it.each(['video_workspaces', 'video_workspace_drafts'])(
  'refuses a missing %s before publishing contracts and permits a complete retry',
  (missing) => {
    const fixture = upgradeFixture();
    const contracts = fixture.contracts();
    const before = structuredClone(fixture.durable);
    fixture.names.delete(missing);
    expect(() => handleDatabaseUpgrade(fixture.db, 6, 7, fixture.tx)).toThrow('unavailable');
    expect(fixture.tx.abort).toHaveBeenCalledOnce();
    expect(fixture.tx.objectStore).not.toHaveBeenCalled();
    expect(fixture.contracts()).toEqual(contracts);
    expect(fixture.durable).toEqual(before);
    fixture.names.add(missing);
    fixture.retry();
    handleDatabaseUpgrade(fixture.db, 6, 7, fixture.tx);
    fixture.commit();
    expect(new Set(fixture.contracts())).toEqual(new Set(CURRENT_SCHEMA_CONTRACTS));
  }
);

it('rolls back interrupted contract publication and reruns without partial domain admission', () => {
  const fixture = upgradeFixture(3);
  const contracts = fixture.contracts();
  const before = structuredClone(fixture.durable);
  expect(() => handleDatabaseUpgrade(fixture.db, 6, 7, fixture.tx)).toThrow('Interrupted');
  expect(fixture.tx.abort).toHaveBeenCalledOnce();
  expect(() => fixture.commit()).toThrow('Aborted');
  expect(fixture.contracts()).toEqual(contracts);
  expect(fixture.durable).toEqual(before);
  fixture.retry();
  handleDatabaseUpgrade(fixture.db, 6, 7, fixture.tx);
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

it('requires the exact presentation domain contract at the current physical version', () => {
  expect(parseStoredSchemaContracts(CURRENT_SCHEMA_CONTRACTS)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  for (const schemaVersion of [5, 9]) {
    const incompatible = CURRENT_SCHEMA_CONTRACTS.map((contract) =>
      contract.domainId === 'mediaLibrary' ? { ...contract, schemaVersion } : contract
    );
    expect(parseStoredSchemaContracts(incompatible)).toBeNull();
  }
});
