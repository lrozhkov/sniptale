import { expect, it, vi } from 'vitest';
import { DATABASE_MIGRATIONS, PERSISTENCE_DOMAIN_REGISTRY } from '../schema-contracts';

it('adds durable recording recovery without modifying released rows or immutable bytes', () => {
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 32);
  expect(migration).toBeDefined();
  if (!migration) return;
  const names = new Set<string>();
  const stores = new Map<
    string,
    { createIndex: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> }
  >();
  const createObjectStore = vi.fn((name: string, _options?: IDBObjectStoreParameters) => {
    names.add(name);
    const store = { createIndex: vi.fn(), put: vi.fn() };
    stores.set(name, store);
    return store;
  });
  const deleteObjectStore = vi.fn();
  const objectStore = vi.fn();
  const db = {
    createObjectStore,
    deleteObjectStore,
    objectStoreNames: { contains: (name: string) => names.has(name) },
  };
  const transaction = { abort: vi.fn(), objectStore };
  expect(migration.migrate(db, transaction)).toBeUndefined();
  expect(migration.validate(db, transaction)).toBeUndefined();
  expect(createObjectStore.mock.calls).toEqual([
    ['recording_recovery_sessions', { keyPath: 'id' }],
    ['recording_recovery_blocks', { keyPath: ['id', 'index'] }],
  ]);
  expect(stores.get('recording_recovery_sessions')?.createIndex.mock.calls).toEqual([
    ['createdAt', 'createdAt'],
  ]);
  expect(stores.get('recording_recovery_blocks')?.createIndex.mock.calls).toEqual([['id', 'id']]);
  expect(objectStore).not.toHaveBeenCalled();
  expect(deleteObjectStore).not.toHaveBeenCalled();
  for (const store of stores.values()) expect(store.put).not.toHaveBeenCalled();
  expect(migration).toMatchObject({
    toDatabaseVersion: 33,
    risk: 'additive',
    backupCoverage: 'none',
    domainVersions: [{ domainId: 'recordings', from: 2, to: 3 }],
  });
  const recordings = PERSISTENCE_DOMAIN_REGISTRY.find((domain) => domain.domainId === 'recordings');
  expect(recordings?.stores).toEqual(
    expect.arrayContaining([
      { storeName: 'recording_recovery_sessions', dataClass: 'durable-authority' },
      { storeName: 'recording_recovery_blocks', dataClass: 'durable-authority' },
    ])
  );
});
