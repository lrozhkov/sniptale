import { expect, it, vi } from 'vitest';
import { betaV24Fixture } from '../fixtures/beta-v24';
import { DATABASE_MIGRATIONS } from '../schema-contracts';

it('advances private source and known-source journal contracts without rewriting authority', () => {
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
  for (const source of [24, 25]) {
    const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === source)!;
    expect(migration.migrate(db, tx)).toBeUndefined();
    expect(migration.validate(db, tx)).toBeUndefined();
    expect(migration.domainVersions).toEqual([
      { domainId: 'assetGraph', from: source - 23, to: source - 22 },
    ]);
  }
  expect(db.createObjectStore).not.toHaveBeenCalled();
  expect(db.deleteObjectStore).not.toHaveBeenCalled();
  expect(tx.abort).not.toHaveBeenCalled();
  expect(tx.objectStore).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
});
