import { openDB } from 'idb';
import { expect, it, vi } from 'vitest';
import { DATABASE_MIGRATIONS } from '../schema-contracts';
const mocks = vi.hoisted(() => ({ openDB: vi.fn() }));
vi.mock('idb', () => ({ openDB: mocks.openDB }));
const migration = DATABASE_MIGRATIONS.find((entry) => entry.fromDatabaseVersion === 8)!;
it('estimates alias index allocation using the admission-owned source connection', async () => {
  const close = vi.fn();
  mocks.openDB.mockResolvedValue({
    close,
    transaction: (store: string) => ({
      store: {
        openCursor: async () => ({
          primaryKey: 'row',
          value:
            store === 'project_assets'
              ? { originMediaId: 'origin' }
              : { borrowedMediaId: 'origin', galleryAssetId: 'origin' },
          continue: async () => null,
        }),
      },
    }),
  });
  expect(await migration.estimateAdditionalBytes(await openDB('test'))).toBe(
    64 * 1024 + 3 * (1024 + 4 * 9)
  );
  expect(close).not.toHaveBeenCalled();
});
it('propagates failed estimation to the admission owner', async () => {
  const close = vi.fn();
  mocks.openDB.mockResolvedValue({
    close,
    transaction: () => {
      throw new Error('unavailable');
    },
  });
  await expect(migration.estimateAdditionalBytes(await openDB('test'))).rejects.toThrow(
    'unavailable'
  );
  expect(close).not.toHaveBeenCalled();
});

it('skips invalid aliases and charges each native cursor row', async () => {
  mocks.openDB.mockResolvedValue({
    transaction: (store: string) => {
      const values: unknown[] =
        store === 'project_assets'
          ? [null, [], { originMediaId: 42 }, { originMediaId: 'origin' }]
          : [{ borrowedMediaId: false }, { galleryAssetId: 'gallery' }];
      const cursor = (index: number): unknown =>
        index < values.length
          ? { primaryKey: 'row', value: values[index], continue: async () => cursor(index + 1) }
          : null;
      return { store: { openCursor: async () => cursor(0) } };
    },
  });
  expect(await migration.estimateAdditionalBytes(await openDB('test'))).toBe(
    64 * 1024 + (1024 + 4 * 9) + (1024 + 4 * 10)
  );
});

it('refuses alias rows with invalid native keys', async () => {
  mocks.openDB.mockResolvedValue({
    transaction: () => ({
      store: {
        openCursor: async () => ({
          primaryKey: 42,
          value: { originMediaId: 'origin' },
          continue: async () => null,
        }),
      },
    }),
  });
  await expect(migration.estimateAdditionalBytes(await openDB('test'))).rejects.toThrow(
    'Invalid project usage index key'
  );
});

it('requires the admission-owned source connection', async () => {
  await expect(migration.estimateAdditionalBytes()).rejects.toThrow('Source database unavailable');
});
it('creates only native indexes, with multiEntry enabled only for derived document keys', () => {
  const created: unknown[] = [];
  const put = vi.fn();
  const getAll = vi.fn();
  const transaction = {
    abort: vi.fn(),
    objectStore: (store: string) => ({
      createIndex: (name: string, path: string | string[], options?: IDBIndexParameters) =>
        created.push({ store, name, path, multiEntry: options?.multiEntry }),
      put,
      getAll,
      clear: vi.fn(),
      delete: vi.fn(),
    }),
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: vi.fn(),
    deleteObjectStore: vi.fn(),
  };
  migration.migrate(db, transaction);
  expect(created).toEqual([
    {
      store: 'video_projects',
      name: 'usageReferenceKeys',
      path: 'usageReferenceKeys',
      multiEntry: true,
    },
    {
      store: 'video_workspaces',
      name: 'usageReferenceKeys',
      path: 'usageReferenceKeys',
      multiEntry: true,
    },
    { store: 'project_assets', name: 'originMediaId', path: 'originMediaId', multiEntry: false },
    {
      store: 'scenario_assets',
      name: 'borrowedMediaId',
      path: 'borrowedMediaId',
      multiEntry: false,
    },
    { store: 'scenario_assets', name: 'galleryAssetId', path: 'galleryAssetId', multiEntry: false },
  ]);
  expect(put).not.toHaveBeenCalled();
  expect(getAll).not.toHaveBeenCalled();
});
