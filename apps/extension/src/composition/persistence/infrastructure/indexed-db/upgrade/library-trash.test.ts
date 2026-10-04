import { expect, it, vi } from 'vitest';
import { handleDatabaseUpgrade } from './core';
import { DATABASE_MIGRATIONS } from '../schema-contracts';
import { betaV3Fixture } from '../fixtures/beta-v3';

it('admits Trash without mutating existing aggregates or their durable object graph', async () => {
  const names = new Set<string>(betaV3Fixture.stores);
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
  handleDatabaseUpgrade(db, 3, 4, tx);
  expect(db.createObjectStore).not.toHaveBeenCalled();
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.objectStore.mock.calls.every(([name]) => name === 'schema_contracts')).toBe(true);
  expect(put).toHaveBeenCalledWith({ domainId: 'mediaLibrary', schemaVersion: 3 });
  expect(put).toHaveBeenCalledWith({ domainId: 'scenarioProjects', schemaVersion: 3 });
  expect(put).toHaveBeenCalledWith({ domainId: 'videoProjects', schemaVersion: 2 });
  const migration = DATABASE_MIGRATIONS.find((entry) => entry.fromDatabaseVersion === 3)!;
  expect(await migration.estimateAdditionalBytes()).toBe(64 * 1024);
  expect(migration.risk).toBe('additive');
  expect(migration.backupCoverage).toBe('none');
});

it('refuses missing source stores without publishing domain versions and permits retry', () => {
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
  expect(() => handleDatabaseUpgrade(db, 3, 4, tx)).toThrow('unavailable');
  expect(tx.abort).toHaveBeenCalledOnce();
  expect(put).not.toHaveBeenCalled();
  db.objectStoreNames.contains = () => true;
  handleDatabaseUpgrade(db, 3, 4, tx);
  expect(put).toHaveBeenCalledWith({ domainId: 'mediaLibrary', schemaVersion: 3 });
});
