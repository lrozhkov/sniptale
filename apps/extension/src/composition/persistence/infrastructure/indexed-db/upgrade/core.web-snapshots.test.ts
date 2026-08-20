import { expect, it, vi } from 'vitest';
import { applyWebSnapshotsV30Upgrade } from './core.web-snapshots';

it('removes only legacy web snapshot rows and their linked media graph', async () => {
  const stores = new Map([
    ['web_snapshots', createStore([{ id: 'snapshot-1', packageBlob: new Blob(['zip']) }])],
    [
      'media_library',
      createStore([
        { id: 'snapshot-1', source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' } },
        { id: 'image-1', source: { kind: 'screenshot' } },
      ]),
    ],
    ['thumbnails', createStore()],
  ]);
  await applyWebSnapshotsV30Upgrade(29, createTransaction(stores));
  expect(stores.get('web_snapshots')?.clear).toHaveBeenCalledOnce();
  expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('snapshot-1');
  expect(stores.get('media_library')?.delete).not.toHaveBeenCalledWith('image-1');
  expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('snapshot-1');
});

it('is non-destructive for fresh and upgraded databases', async () => {
  const transaction = createTransaction(new Map());
  await applyWebSnapshotsV30Upgrade(0, transaction);
  await applyWebSnapshotsV30Upgrade(30, transaction);
  expect(transaction.objectStore).not.toHaveBeenCalled();
});

it('requires the versionchange transaction', async () => {
  await expect(applyWebSnapshotsV30Upgrade(29)).rejects.toThrow(
    'Web snapshot upgrade transaction is unavailable.'
  );
});

function createStore(entries: unknown[] = []) {
  return {
    clear: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    getAll: vi.fn(async () => entries),
  };
}

function createTransaction(stores: Map<string, ReturnType<typeof createStore>>) {
  return {
    abort: vi.fn(),
    objectStore: vi.fn((name: string) => stores.get(name)!),
  };
}
