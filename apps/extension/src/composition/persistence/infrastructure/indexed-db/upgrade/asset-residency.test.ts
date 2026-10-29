import { expect, it, vi } from 'vitest';
import {
  DATABASE_MIGRATIONS,
  PERSISTENCE_DOMAIN_REGISTRY,
  CURRENT_SCHEMA_CONTRACTS,
} from '../schema-contracts';
import { ASSET_RESIDENCY_STORE, SCHEMA_CONTRACTS_STORE } from '../core.stores';
import { betaV45Fixture } from '../fixtures/beta-v45';
import { betaV46Fixture } from '../fixtures/beta-v46';
import { executeDatabaseUpgrade } from './core';

function harness(failCreate = false) {
  const names = new Set<string>(betaV45Fixture.stores);
  const createIndex = vi.fn();
  const put = vi.fn();
  const createObjectStore = vi.fn((name: string, _options?: IDBObjectStoreParameters) => {
    if (failCreate) throw new DOMException('No space', 'QuotaExceededError');
    names.add(name);
    return { createIndex, put };
  });
  const contracts = { put: vi.fn(), clear: vi.fn(), delete: vi.fn(), getAll: vi.fn() };
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore,
    deleteObjectStore: vi.fn(),
  };
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn((name: string) => {
      if (name !== SCHEMA_CONTRACTS_STORE) throw new Error('Existing native store was accessed');
      return contracts;
    }),
  };
  return { db, tx, createIndex, put, contracts };
}

it('adds empty native residency authority from v45 without accessing or rewriting old content', () => {
  const f = harness();
  executeDatabaseUpgrade(f.db, 45, 46, f.tx, DATABASE_MIGRATIONS);
  expect(f.db.createObjectStore.mock.calls).toEqual([[ASSET_RESIDENCY_STORE, { keyPath: 'id' }]]);
  expect(f.createIndex).not.toHaveBeenCalled();
  expect(f.put).not.toHaveBeenCalled();
  expect(f.db.deleteObjectStore).not.toHaveBeenCalled();
  expect(f.tx.objectStore.mock.calls).toEqual([[SCHEMA_CONTRACTS_STORE]]);
  expect(f.contracts.put.mock.calls.map(([record]) => record)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(f.tx.abort).not.toHaveBeenCalled();
  expect(betaV46Fixture.records).toEqual({ ...betaV45Fixture.records, asset_residency: [] });
  expect(betaV46Fixture.opfsObjects).toEqual(betaV45Fixture.opfsObjects);
  expect(betaV46Fixture.domainVersions).toEqual({
    ...betaV45Fixture.domainVersions,
    assetGraph: 4,
  });
  expect(betaV46Fixture.stores).toEqual([
    ...betaV45Fixture.stores.filter((name) => name !== SCHEMA_CONTRACTS_STORE),
    ASSET_RESIDENCY_STORE,
    SCHEMA_CONTRACTS_STORE,
  ]);
  expect(
    PERSISTENCE_DOMAIN_REGISTRY.find((domain) => domain.domainId === 'assetGraph')
  ).toMatchObject({
    schemaVersion: 4,
    stores: expect.arrayContaining([
      { storeName: ASSET_RESIDENCY_STORE, dataClass: 'durable-authority' },
    ]),
  });
});

it('aborts a failed v45 residency upgrade and permits the same source to retry', () => {
  const failed = harness(true);
  expect(() => executeDatabaseUpgrade(failed.db, 45, 46, failed.tx, DATABASE_MIGRATIONS)).toThrow(
    'No space'
  );
  expect(failed.tx.abort).toHaveBeenCalledOnce();
  expect(failed.contracts.put).not.toHaveBeenCalled();
  const retry = harness();
  expect(() =>
    executeDatabaseUpgrade(retry.db, 45, 46, retry.tx, DATABASE_MIGRATIONS)
  ).not.toThrow();
  expect(retry.db.createObjectStore).toHaveBeenCalledWith(ASSET_RESIDENCY_STORE, { keyPath: 'id' });
  expect(retry.tx.abort).not.toHaveBeenCalled();
});
