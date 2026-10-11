import { expect, it, vi } from 'vitest';
import { DB_VERSION, VIDEO_WORKSPACE_HISTORY_STORE } from '../core.stores';
import { betaV17Fixture } from '../fixtures/beta-v17';
import { DATABASE_MIGRATIONS } from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';

it('adds only an empty indexed history store and publishes the current contract after validation', () => {
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
  expect(db.createObjectStore).toHaveBeenCalledExactlyOnceWith(VIDEO_WORKSPACE_HISTORY_STORE, {
    keyPath: ['aggregateId', 'ordinal'],
  });
  expect(indexes).toHaveBeenCalledExactlyOnceWith('aggregateId', 'aggregateId');
  expect(tx.objectStore).toHaveBeenCalledExactlyOnceWith('schema_contracts');
  expect(puts).toHaveBeenCalledWith({ domainId: 'mediaLibrary', schemaVersion: 17 });
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
