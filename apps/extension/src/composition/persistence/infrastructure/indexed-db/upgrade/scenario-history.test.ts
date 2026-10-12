import { expect, it, vi } from 'vitest';
import {
  DB_VERSION,
  SCENARIO_PROJECT_HISTORY_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
} from '../core.stores';
import { betaV18Fixture } from '../fixtures/beta-v18';
import { DATABASE_MIGRATIONS } from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';

it('adds only an empty scenario history store before publishing the current contract', () => {
  const names = new Set<string>(betaV18Fixture.stores);
  const createIndex = vi.fn();
  const put = vi.fn();
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({ put, clear: vi.fn(), delete: vi.fn(), getAll: vi.fn() })),
  };
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      return { createIndex, put };
    }),
    deleteObjectStore: vi.fn(),
  };
  handleDatabaseUpgrade(db, 18, DB_VERSION, tx);
  expect(db.createObjectStore.mock.calls).toEqual([
    [SCENARIO_PROJECT_HISTORY_STORE, { keyPath: ['projectId', 'revision'] }],
    [SCENARIO_PROJECT_UNITS_STORE, { keyPath: ['projectId', 'unitId', 'revision'] }],
  ]);
  expect(createIndex.mock.calls).toEqual([
    ['projectId', 'projectId'],
    ['projectId', 'projectId'],
  ]);
  expect(tx.objectStore).toHaveBeenCalledExactlyOnceWith('schema_contracts');
  expect(put).toHaveBeenCalledWith({ domainId: 'scenarioProjects', schemaVersion: 7 });
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.abort).not.toHaveBeenCalled();
});

it('aborts interruption without reading or rewriting existing project rows', async () => {
  const tx = { abort: vi.fn(), objectStore: vi.fn() };
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(() => {
      throw new Error('Interrupted scenario store creation');
    }),
    deleteObjectStore: vi.fn(),
  };
  expect(() => handleDatabaseUpgrade(db, 18, DB_VERSION, tx)).toThrow('Interrupted');
  expect(tx.abort).toHaveBeenCalledOnce();
  expect(tx.objectStore).not.toHaveBeenCalled();
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  const descriptor = DATABASE_MIGRATIONS.find((item) => item.fromDatabaseVersion === 18)!;
  expect(descriptor).toMatchObject({
    toDatabaseVersion: 19,
    risk: 'additive',
    backupCoverage: 'none',
    stores: [SCENARIO_PROJECT_HISTORY_STORE],
    domainVersions: [{ domainId: 'scenarioProjects', from: 4, to: 5 }],
  });
  expect(() => descriptor.validate(db, tx)).toThrow('history store');
  await expect(descriptor.estimateAdditionalBytes()).resolves.toBe(65536);
});
