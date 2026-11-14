import 'fake-indexeddb/auto';
import { openDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  EDITOR_VECTOR_LIBRARY_STORE,
  EXPECTED_STORES,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';

const harness = vi.hoisted(() => ({
  database: undefined as unknown,
  eraseAssetStorage: vi.fn(),
}));
vi.mock(
  '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core',
  async () => ({
    ...(await import('../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores')),
    initDB: async () => harness.database,
  })
);
vi.mock('../../../../apps/extension/src/composition/persistence/assets', () => ({
  eraseAssetStorage: harness.eraseAssetStorage,
}));
vi.mock('../../../../apps/extension/src/composition/persistence/recordings', () => ({
  saveRecording: vi.fn(),
}));

import { clearHarnessMediaLibrary } from './browser-mocks.media-library';

let database: IDBPDatabase;
let databaseName: string;
let abortBeforeCommit = false;
const bytes = new Map<string, string>();

beforeEach(async () => {
  harness.eraseAssetStorage.mockReset();
  abortBeforeCommit = false;
  databaseName = `harness-media-clear-${crypto.randomUUID()}`;
  database = await openDB(databaseName, 1, {
    upgrade(db) {
      for (const name of EXPECTED_STORES) db.createObjectStore(name, { keyPath: 'key' });
    },
  });
  harness.database = {
    transaction(names: string[], mode: IDBTransactionMode) {
      const transaction = database.transaction(names, mode);
      return {
        objectStore: (name: string) => transaction.objectStore(name),
        get done() {
          if (abortBeforeCommit) transaction.abort();
          return transaction.done;
        },
      };
    },
  };
  const definitionId = 'a'.repeat(64);
  await database.put(EDITOR_VECTOR_LIBRARY_STORE, {
    key: `definition:${definitionId}`,
    kind: 'definition',
    definitionId,
    assetId: 'vector-bytes',
    incarnation: 'original',
    retained: true,
  });
  await database.put(EDITOR_VECTOR_LIBRARY_STORE, {
    key: `item:${definitionId}`,
    kind: 'item',
    definitionId,
    favorite: true,
  });
  await database.put(EDITOR_VECTOR_LIBRARY_STORE, {
    key: 'cache:preview',
    kind: 'cache',
    payload: '<svg/>',
  });
  await database.put(ASSET_REFS_STORE, { key: 'vector-bytes', assetId: 'vector-bytes' });
  await database.put(ASSET_OWNERS_STORE, {
    key: 'vector-owner',
    assetId: 'vector-bytes',
    ownerKind: 'editor-vector-definition',
  });
  bytes.clear();
  bytes.set('vector-bytes', '<svg/>');
  harness.eraseAssetStorage.mockImplementation(async () => {
    expect(await database.count(EDITOR_VECTOR_LIBRARY_STORE)).toBe(0);
    expect(await database.count(ASSET_REFS_STORE)).toBe(0);
    expect(await database.count(ASSET_OWNERS_STORE)).toBe(0);
    bytes.clear();
  });
});
afterEach(() => database.close());

it(
  'clears vector backing, items and cache with asset references before erasing ' +
    'bytes and stays empty after reopen',
  async () => {
    await clearHarnessMediaLibrary();
    expect(harness.eraseAssetStorage).toHaveBeenCalledOnce();
    expect(bytes.size).toBe(0);
    database.close();
    database = await openDB(databaseName, 1);
    expect(await database.count(EDITOR_VECTOR_LIBRARY_STORE)).toBe(0);
    expect(await database.count(ASSET_REFS_STORE)).toBe(0);
    expect(await database.count(ASSET_OWNERS_STORE)).toBe(0);
  }
);

it('preserves committed metadata and bytes when the reset transaction aborts before commit', async () => {
  abortBeforeCommit = true;
  await expect(clearHarnessMediaLibrary()).rejects.toMatchObject({ name: 'AbortError' });
  expect(harness.eraseAssetStorage).not.toHaveBeenCalled();
  expect(await database.count(EDITOR_VECTOR_LIBRARY_STORE)).toBe(3);
  expect(await database.count(ASSET_REFS_STORE)).toBe(1);
  expect(await database.count(ASSET_OWNERS_STORE)).toBe(1);
  expect(bytes.get('vector-bytes')).toBe('<svg/>');
});
