import { expect, it, vi } from 'vitest';
import {
  createTimelineThumbnailStore,
  deleteProjectThumbnails,
  pruneTimelineThumbnails,
} from './thumbnails';
import {
  timelineThumbnailKey,
  TIMELINE_THUMBNAIL_MAX_AGE_MS,
  TIMELINE_THUMBNAIL_MAX_FRAMES,
} from './thumbnail-model';
import type { VideoPreviewCacheTransaction, VideoPreviewCacheDatabasePort } from './database';

function fixture() {
  const rows = new Map<string, unknown>();
  const metadata = new Map<string, unknown>();
  const tx: VideoPreviewCacheTransaction = {
    getPoster: async () => null,
    listPosterEntries: async () => [],
    putPoster: async () => {},
    deletePoster: async () => {},
    getThumbnail: async (key) => rows.get(key),
    listThumbnailEntries: async () => [...rows].map(([key, value]) => ({ key, value })),
    putThumbnail: vi.fn(async (key, value) => {
      rows.set(key, value);
    }),
    deleteThumbnail: async (key) => {
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
  };
  const database: VideoPreviewCacheDatabasePort = {
    close: async () => {},
    deleteDatabase: async () => {
      rows.clear();
      metadata.clear();
    },
    verifyAbsent: async () => true,
    mutateExisting: async (operation) => operation(tx),
    mutateOrCreate: async (operation) => operation(tx),
    readExisting: async (operation) => operation(tx),
  };
  let now = 100;
  const store = createTimelineThumbnailStore({
    database,
    now: () => now,
    randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  });
  return {
    rows,
    tx,
    database,
    store,
    advance: () => {
      now += TIMELINE_THUMBNAIL_MAX_AGE_MS;
    },
  };
}
const frame = {
  projectId: 'p',
  sourceKey: 's',
  sourceTime: 1,
  createdAt: 100,
  blob: new Blob(['webp'], { type: 'image/webp' }),
};
it('restores immutable batch entries, never rewrites hits, expires without writing on reads', async () => {
  const f = fixture();
  const token = await f.store.begin();
  await f.store.commit(token, [frame]);
  await f.store.commit(token, [frame]);
  expect(f.tx.putThumbnail).toHaveBeenCalledTimes(1);
  expect(await f.store.load('p', 's', [1, 2])).toEqual([frame]);
  expect(await f.store.load('p', 'replacement', [1])).toEqual([]);
  f.advance();
  expect(await f.store.load('p', 's', [1])).toEqual([]);
  expect(f.rows.size).toBe(1);
  await pruneTimelineThumbnails(f.tx, 100 + TIMELINE_THUMBNAIL_MAX_AGE_MS);
  expect(f.rows.size).toBe(0);
});
it('rejects invalidated writers after erasure even when a new job begins', async () => {
  const f = fixture();
  const old = await f.store.begin();
  await f.database.deleteDatabase();
  await f.tx.putMetadata('database-instance-id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await f.store.commit(old, [frame]);
  expect(f.rows.size).toBe(0);
});
it('bounds frame count and bytes and removes project frames plus corrupt entries', async () => {
  const f = fixture();
  for (let i = 0; i < TIMELINE_THUMBNAIL_MAX_FRAMES + 2; i++) {
    const item = { ...frame, sourceTime: i };
    f.rows.set(timelineThumbnailKey(item), item);
  }
  await pruneTimelineThumbnails(f.tx, 100);
  expect(f.rows.size).toBe(TIMELINE_THUMBNAIL_MAX_FRAMES);
  f.rows.clear();
  const blob = new Blob([new Uint8Array(256 * 1024)], { type: 'image/webp' });
  for (let i = 0; i < 140; i++) {
    const item = { ...frame, sourceTime: i, blob };
    f.rows.set(timelineThumbnailKey(item), item);
  }
  await pruneTimelineThumbnails(f.tx, 100);
  expect(f.rows.size).toBe(128);
  f.rows.set('bad', { invalid: true });
  expect(await deleteProjectThumbnails(f.tx, 'p')).toBe(129);
  expect(f.rows.size).toBe(0);
});
