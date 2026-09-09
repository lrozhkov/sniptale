import { expect, it, vi } from 'vitest';
import { createEffectPosterStore } from './effect-posters';
import type { VideoPreviewCacheDatabasePort, VideoPreviewCacheTransaction } from './database';

function fixture() {
  const rows = new Map<string, unknown>();
  const metadata = new Map<string, unknown>();
  const tx: VideoPreviewCacheTransaction = {
    getPoster: async (key) => rows.get(key),
    listPosterEntries: async () => [...rows].map(([key, value]) => ({ key, value })),
    putPoster: vi.fn(async (key, value) => {
      rows.set(key, value);
    }),
    deletePoster: async (key) => {
      rows.delete(key);
    },
    getMetadata: async (key) => metadata.get(key),
    putMetadata: async (key, value) => {
      metadata.set(key, value);
    },
    getRecord: async () => null,
    listRecordEntries: async () => [],
    deleteRecord: async () => {},
    putRecord: async () => {},
    getThumbnail: async () => null,
    listThumbnailEntries: async () => [],
    deleteThumbnail: async () => {},
    putThumbnail: async () => {},
  };
  let exists = true;
  const database: VideoPreviewCacheDatabasePort = {
    close: async () => {},
    deleteDatabase: async () => {
      exists = false;
      rows.clear();
      metadata.clear();
    },
    verifyAbsent: async () => !exists,
    mutateExisting: async (operation) => (exists ? operation(tx) : null),
    mutateOrCreate: async (operation) => {
      exists = true;
      return operation(tx);
    },
    readExisting: async (operation) => (exists ? operation(tx) : null),
  };
  return { database, rows, tx };
}
const blob = new Blob(['cover'], { type: 'image/webp' });
it('survives store recreation, leaves hits immutable, expires and bounds retained covers', async () => {
  const f = fixture();
  const store = createEffectPosterStore(f.database, () => 100);
  const token = await store.begin();
  await store.commit(token, 'cover', blob);
  const reopened = createEffectPosterStore(f.database, () => 200);
  expect(await reopened.load('cover')).toBe(blob);
  await reopened.commit(token, 'cover', blob);
  expect(f.tx.putPoster).toHaveBeenCalledOnce();
  for (let i = 0; i < 140; i++) await reopened.commit(token, `cover-${i}`, blob);
  expect(f.rows.size).toBe(128);
  const expired = createEffectPosterStore(f.database, () => 31 * 86400000);
  expect(await expired.load('cover-99')).toBeNull();
  expect(f.rows.size).toBe(128);
});
it('cannot resurrect covers after erasure, even when a new cache job opens the database', async () => {
  const f = fixture();
  const store = createEffectPosterStore(f.database);
  const stale = await store.begin();
  await f.database.deleteDatabase();
  await store.begin();
  await store.commit(stale, 'late', blob);
  expect(f.rows.size).toBe(0);
});
