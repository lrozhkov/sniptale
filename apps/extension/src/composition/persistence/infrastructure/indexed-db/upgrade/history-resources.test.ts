import { expect, it, vi } from 'vitest';
import { betaV24Fixture } from '../fixtures/beta-v24';
import { DB_VERSION } from '../core.stores';
import { handleDatabaseUpgrade } from './core';

it('advances only the deletion journal contract without rewriting existing authority', () => {
  const put = vi.fn();
  const tx = {
    abort: vi.fn(),
    objectStore: vi.fn(() => ({ put, clear: vi.fn(), delete: vi.fn(), getAll: vi.fn() })),
  };
  const db = {
    objectStoreNames: {
      contains: (name: string) => betaV24Fixture.stores.some((store) => store === name),
    },
    createObjectStore: vi.fn(),
    deleteObjectStore: vi.fn(),
  };
  handleDatabaseUpgrade(db, 24, DB_VERSION, tx);
  expect(put).toHaveBeenCalledWith({ domainId: 'assetGraph', schemaVersion: 2 });
  expect(db.createObjectStore).not.toHaveBeenCalled();
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.abort).not.toHaveBeenCalled();
  expect(tx.objectStore).toHaveBeenCalledExactlyOnceWith('schema_contracts');
});
