import { expect, it, vi } from 'vitest';
import {
  DB_VERSION,
  SCENARIO_PROJECT_UNITS_STORE,
  RECORDING_RECOVERY_SESSIONS_STORE,
  RECORDING_RECOVERY_BLOCKS_STORE,
} from '../core.stores';
import { betaV19Fixture } from '../fixtures/beta-v19';
import { DATABASE_MIGRATIONS } from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';

it('adds only an empty indexed unit store before publishing the current scenario contract', () => {
  const names = new Set<string>(betaV19Fixture.stores);
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
  handleDatabaseUpgrade(db, 19, DB_VERSION, tx);
  expect(db.createObjectStore.mock.calls).toEqual([
    [SCENARIO_PROJECT_UNITS_STORE, { keyPath: ['projectId', 'unitId', 'revision'] }],
    [RECORDING_RECOVERY_SESSIONS_STORE, { keyPath: 'id' }],
    [RECORDING_RECOVERY_BLOCKS_STORE, { keyPath: ['id', 'index'] }],
  ]);
  expect(createIndex.mock.calls).toEqual([
    ['projectId', 'projectId'],
    ['createdAt', 'createdAt'],
    ['id', 'id'],
  ]);
  expect(tx.objectStore).toHaveBeenCalledExactlyOnceWith('schema_contracts');
  expect(put).toHaveBeenCalledWith({ domainId: 'scenarioProjects', schemaVersion: 7 });
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.abort).not.toHaveBeenCalled();
});

it('aborts interruption without reading, rewriting or pruning released project/history data', async () => {
  const tx = { abort: vi.fn(), objectStore: vi.fn() };
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(() => {
      throw new Error('Interrupted scenario unit admission');
    }),
    deleteObjectStore: vi.fn(),
  };
  expect(() => handleDatabaseUpgrade(db, 19, DB_VERSION, tx)).toThrow('Interrupted');
  expect(tx.abort).toHaveBeenCalledOnce();
  expect(tx.objectStore).not.toHaveBeenCalled();
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  const descriptor = DATABASE_MIGRATIONS.find((item) => item.fromDatabaseVersion === 19)!;
  expect(descriptor).toMatchObject({
    toDatabaseVersion: 20,
    risk: 'additive',
    backupCoverage: 'none',
    stores: [SCENARIO_PROJECT_UNITS_STORE],
    domainVersions: [{ domainId: 'scenarioProjects', from: 5, to: 6 }],
  });
  expect(() => descriptor.validate(db, tx)).toThrow('units store');
  await expect(descriptor.estimateAdditionalBytes()).resolves.toBe(65536);
});
