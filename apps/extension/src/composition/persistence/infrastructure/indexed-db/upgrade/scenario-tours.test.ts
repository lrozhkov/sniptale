import { expect, it, vi } from 'vitest';
import { handleDatabaseUpgrade } from './core';
import { DATABASE_MIGRATIONS } from '../schema-contracts';
import { betaV2Fixture } from '../fixtures/beta-v2';

it('updates only admission metadata and preserves every beta2 store and media object', async () => {
  const names = new Set<string>(betaV2Fixture.stores);
  const put = vi.fn();
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn(),
    deleteObjectStore: vi.fn(),
  };
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn((_name: string) => ({
      put,
      clear: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    })),
  };
  handleDatabaseUpgrade(db, 2, 3, tx);
  expect(db.createObjectStore).not.toHaveBeenCalled();
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.abort).not.toHaveBeenCalled();
  expect(put).toHaveBeenCalledWith({ domainId: 'scenarioProjects', schemaVersion: 2 });
  expect(tx.objectStore.mock.calls.every(([store]) => store === 'schema_contracts')).toBe(true);
  const migration = DATABASE_MIGRATIONS.find((item) => item.fromDatabaseVersion === 2)!;
  expect(await migration.estimateAdditionalBytes()).toBe(64 * 1024);
  expect(migration.risk).toBe('additive');
});
it('refuses missing stores before publishing the new contract, then permits an intact rerun', () => {
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
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(),
    deleteObjectStore: vi.fn(),
  };
  expect(() => handleDatabaseUpgrade(db, 2, 3, tx)).toThrow('unavailable');
  expect(tx.abort).toHaveBeenCalledOnce();
  expect(put).not.toHaveBeenCalled();
  db.objectStoreNames.contains = () => true;
  handleDatabaseUpgrade(db, 2, 3, tx);
  expect(put).toHaveBeenCalledWith({ domainId: 'scenarioProjects', schemaVersion: 2 });
});
