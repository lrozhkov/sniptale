import { SYNC_QUEUE_SUMMARY_INDEXES } from '../sync-queue-index-migration';
import { expect, it, vi } from 'vitest';
import {
  DB_VERSION,
  ASSET_RESIDENCY_STORE,
  SYNC_CAPTURE_STORE,
  VIDEO_PROJECT_REVISIONS_STORE,
  SYNC_OUTBOX_STORE,
  SYNC_CATALOG_CACHE_STORE,
  SYNC_CONNECTION_STORE,
  SECRET_PROTECTION_STORE,
  SCENARIO_PROJECT_UNITS_STORE,
  RECORDING_RECOVERY_SESSIONS_STORE,
  RECORDING_RECOVERY_BLOCKS_STORE,
} from '../core.stores';
import { betaV19Fixture } from '../fixtures/beta-v19';
import { DATABASE_MIGRATIONS } from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';
import {
  REFERENCE_INDEX_STORES,
  ROW_REFERENCE_FIELD,
  ROW_REFERENCE_INDEX,
} from '../row-index-contract';

it('adds empty scenario units and DB48 reference indexes before publishing current contracts', async () => {
  const names = new Set<string>(betaV19Fixture.stores);
  const createIndex = vi.fn();
  const put = vi.fn();
  const getAll = vi.fn(() => {
    throw new Error('Upgrade must use native cursor backfill');
  });
  const openCursor = vi.fn().mockResolvedValue(null);
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({
      createIndex,
      put,
      clear: vi.fn(),
      delete: vi.fn(),
      getAll,
      openCursor,
      index: vi.fn(),
    })),
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
    ['voice_input_history', { keyPath: 'id' }],
    [SYNC_CAPTURE_STORE, { keyPath: 'key' }],
    [VIDEO_PROJECT_REVISIONS_STORE, { keyPath: 'projectId' }],
    [SYNC_OUTBOX_STORE, { keyPath: 'key' }],
    [SYNC_CATALOG_CACHE_STORE, { keyPath: 'key' }],
    [SYNC_CONNECTION_STORE, { keyPath: 'key' }],
    [ASSET_RESIDENCY_STORE, { keyPath: 'id' }],
    [SECRET_PROTECTION_STORE, { keyPath: 'key' }],
  ]);
  expect(createIndex.mock.calls).toEqual([
    ['projectId', 'projectId'],
    ['createdAt', 'createdAt'],
    ['id', 'id'],
    ['kind', 'kind'],
    ['rootKey', 'rootKey'],
    ['createdAt', 'createdAt'],
    [
      'syncQueueDue',
      [
        'spaceId',
        'connectionGeneration',
        'profileCreatedAt',
        'authorization.incarnation',
        'nextDueAt',
        'key',
      ],
      { unique: false },
    ],
    ...REFERENCE_INDEX_STORES.map(() => [
      ROW_REFERENCE_INDEX,
      ROW_REFERENCE_FIELD,
      { multiEntry: true },
    ]),
    ['recoveryId', 'recoveryId'],
    ...SYNC_QUEUE_SUMMARY_INDEXES.map(({ indexName, keyPath }) => [
      indexName,
      [...keyPath],
      { unique: false },
    ]),
  ]);
  await vi.waitFor(() =>
    expect(openCursor).toHaveBeenCalledTimes(REFERENCE_INDEX_STORES.length + 1)
  );
  expect(tx.objectStore.mock.calls).toEqual([
    [SYNC_OUTBOX_STORE],
    ...REFERENCE_INDEX_STORES.map((name) => [name]),
    [RECORDING_RECOVERY_SESSIONS_STORE],
    [REFERENCE_INDEX_STORES[0]],
    [SYNC_CAPTURE_STORE],
    [SYNC_OUTBOX_STORE],
    ['schema_contracts'],
    ...REFERENCE_INDEX_STORES.slice(1).map((name) => [name]),
    ['video_workspaces'],
    ['video_workspace_history'],
  ]);
  expect(openCursor.mock.calls).toEqual(REFERENCE_INDEX_STORES.map(() => []).concat([[]]));
  expect(put).toHaveBeenCalledWith({ domainId: 'scenarioProjects', schemaVersion: 9 });
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(getAll).not.toHaveBeenCalled();
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
