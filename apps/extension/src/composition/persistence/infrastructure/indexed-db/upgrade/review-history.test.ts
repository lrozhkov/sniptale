import { expect, it, vi } from 'vitest';
import {
  DB_VERSION,
  RECORDING_RECOVERY_SESSIONS_STORE,
  RECORDING_RECOVERY_BLOCKS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  SCENARIO_PROJECT_HISTORY_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
} from '../core.stores';
import { betaV17Fixture } from '../fixtures/beta-v17';
import { CURRENT_SCHEMA_CONTRACTS, DATABASE_MIGRATIONS } from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';

it('adds only empty indexed history stores and publishes the current contracts after validation', () => {
  const names = new Set<string>(betaV17Fixture.stores);
  const indexes = vi.fn();
  const puts = vi.fn();
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({ put: puts, clear: vi.fn(), delete: vi.fn(), getAll: vi.fn() })),
  };
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      return { createIndex: indexes, put: puts };
    }),
    deleteObjectStore: vi.fn(),
  };
  handleDatabaseUpgrade(db, 17, DB_VERSION, tx);
  expect(db.createObjectStore.mock.calls).toEqual([
    [VIDEO_WORKSPACE_HISTORY_STORE, { keyPath: ['aggregateId', 'ordinal'] }],
    [SCENARIO_PROJECT_HISTORY_STORE, { keyPath: ['projectId', 'revision'] }],
    [SCENARIO_PROJECT_UNITS_STORE, { keyPath: ['projectId', 'unitId', 'revision'] }],
    [RECORDING_RECOVERY_SESSIONS_STORE, { keyPath: 'id' }],
    [RECORDING_RECOVERY_BLOCKS_STORE, { keyPath: ['id', 'index'] }],
    ['voice_input_history', { keyPath: 'id' }],
  ]);
  expect(indexes.mock.calls).toEqual([
    ['aggregateId', 'aggregateId'],
    ['projectId', 'projectId'],
    ['projectId', 'projectId'],
    ['createdAt', 'createdAt'],
    ['id', 'id'],
  ]);
  expect(tx.objectStore).toHaveBeenCalledExactlyOnceWith('schema_contracts');
  expect(puts.mock.calls.map(([contract]) => contract)).toEqual(CURRENT_SCHEMA_CONTRACTS);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.abort).not.toHaveBeenCalled();
});

it('aborts interrupted creation before publishing contracts; admission never scans or rewrites old rows', async () => {
  const tx = { abort: vi.fn(), objectStore: vi.fn() };
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(() => {
      throw new Error('Interrupted creation');
    }),
    deleteObjectStore: vi.fn(),
  };
  expect(() => handleDatabaseUpgrade(db, 17, DB_VERSION, tx)).toThrow('Interrupted creation');
  expect(tx.abort).toHaveBeenCalledOnce();
  expect(tx.objectStore).not.toHaveBeenCalled();
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  const descriptor = DATABASE_MIGRATIONS.find((item) => item.fromDatabaseVersion === 17)!;
  expect(descriptor).toMatchObject({
    toDatabaseVersion: 18,
    risk: 'additive',
    backupCoverage: 'none',
    stores: [VIDEO_WORKSPACE_HISTORY_STORE],
    domainVersions: [{ domainId: 'mediaLibrary', from: 16, to: 17 }],
  });
  expect(() => descriptor.validate(db, tx)).toThrow('history store');
  await expect(descriptor.estimateAdditionalBytes()).resolves.toBe(65536);
});
