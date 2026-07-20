import { beforeEach, expect, it, vi } from 'vitest';

const deleteCalls: Array<{ id: string; storeName: string }> = [];

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  WEB_SNAPSHOTS_STORE: 'web_snapshots',
  initDB: vi.fn(async () => ({
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: (storeName: string) => ({
        delete: (id: string) => deleteCalls.push({ id, storeName }),
      }),
    })),
  })),
}));

beforeEach(() => {
  deleteCalls.length = 0;
});

it('deletes the linked package, media entry, and thumbnail in one cleanup transaction', async () => {
  const { deleteWebSnapshotMediaAsset } = await import('./cleanup');

  await deleteWebSnapshotMediaAsset({ assetId: 'asset-1', snapshotId: 'snapshot-1' });

  expect(deleteCalls).toEqual([
    { id: 'snapshot-1', storeName: 'web_snapshots' },
    { id: 'asset-1', storeName: 'media_library' },
    { id: 'asset-1', storeName: 'thumbnails' },
  ]);
});
