import { expect, it, vi } from 'vitest';
import { DATABASE_MIGRATIONS } from '../schema-contracts';
import { handleDatabaseUpgrade } from './core';
import { betaV1Fixture } from '../fixtures/beta-v1';
import { VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE } from '../core.stores';

it('adds only the two workspace stores and preserves all beta1 stores and contracts until validation', () => {
  const names = new Set<string>(betaV1Fixture.stores);
  const indexes = vi.fn();
  const puts = vi.fn();
  const db = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: vi.fn((name: string) => {
      names.add(name);
      return { createIndex: indexes, put: vi.fn() };
    }),
    deleteObjectStore: vi.fn(),
  };
  const transaction = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({ put: puts, clear: vi.fn(), delete: vi.fn(), getAll: vi.fn() })),
  };
  handleDatabaseUpgrade(db, 1, 2, transaction);
  expect(db.createObjectStore.mock.calls.map(([name]) => name)).toEqual([
    VIDEO_WORKSPACES_STORE,
    VIDEO_WORKSPACE_DRAFTS_STORE,
  ]);
  expect(indexes.mock.calls).toEqual([
    ['updatedAt', 'updatedAt'],
    ['updatedAt', 'updatedAt'],
  ]);
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(transaction.abort).not.toHaveBeenCalled();
  expect(puts).toHaveBeenCalledWith({ domainId: 'mediaLibrary', schemaVersion: 2 });
  for (const name of betaV1Fixture.stores) expect(names.has(name)).toBe(true);
});

it('aborts interrupted creation and refuses a missing target; the descriptor is bounded and additive', async () => {
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(() => {
      throw new Error('interrupted');
    }),
    deleteObjectStore: vi.fn(),
  };
  const tx = { abort: vi.fn(), objectStore: vi.fn() };
  expect(() => handleDatabaseUpgrade(db, 1, 2, tx)).toThrow('interrupted');
  expect(tx.abort).toHaveBeenCalledOnce();
  expect(tx.objectStore).not.toHaveBeenCalled();
  const migration = DATABASE_MIGRATIONS[0]!;
  expect(() => migration.validate(db, tx)).toThrow('creation failed');
  expect(migration.risk).toBe('additive');
  await expect(migration.estimateAdditionalBytes()).resolves.toBe(65536);
});
