import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { WebSnapshotRecord } from '../../../../composition/persistence/web-snapshots/contracts';
import { createWebSnapshotManifest } from '../../../../features/web-snapshot/manifest';
import type { getStore } from '../../storage';

type BackupTransaction = Parameters<typeof getStore>[0];
type BackupObjectStore = ReturnType<BackupTransaction['objectStore']>;

const getStoreMock = vi.hoisted(() => vi.fn());

vi.mock('../../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage')>()),
  getStore: getStoreMock,
}));

beforeEach(() => {
  getStoreMock.mockReset();
});

it('deletes existing web snapshot records from the snapshot store and shared indexes', async () => {
  const { deleteExistingAssetRecord } = await import('.');
  const harness = createWriteHarness();

  await deleteExistingAssetRecord(harness.tx, createWebSnapshotMediaEntry());

  expect(harness.stores.get('web_snapshots')?.delete).toHaveBeenCalledWith('snapshot-1');
  expect(harness.stores.get('media_library')?.delete).toHaveBeenCalledWith(
    'web-snapshot:snapshot-1'
  );
  expect(harness.stores.get('thumbnails')?.delete).toHaveBeenCalledWith('web-snapshot:snapshot-1');
});

it('restores web snapshot records only with the required snapshot record', async () => {
  const { writeMainAssetRecord } = await import('.');
  const harness = createWriteHarness();
  const entry = createWebSnapshotMediaEntry();
  const snapshotRecord = createWebSnapshotRecord();

  await writeMainAssetRecord(harness.tx, entry, new Blob(['asset']), null, snapshotRecord);

  expect(harness.stores.get('web_snapshots')?.put).toHaveBeenCalledWith(snapshotRecord);
  expect(harness.stores.get('media_library')?.put).toHaveBeenCalledWith(entry);
});

it('rejects web snapshot restore without the required snapshot record', async () => {
  const { writeMainAssetRecord } = await import('.');
  const harness = createWriteHarness();
  const entry = createWebSnapshotMediaEntry();

  await expect(writeMainAssetRecord(harness.tx, entry, new Blob(['asset']), null)).rejects.toThrow(
    'Web snapshot backup record is missing.'
  );

  expect(harness.stores.get('web_snapshots')?.put).not.toHaveBeenCalled();
  expect(harness.stores.get('media_library')?.put).not.toHaveBeenCalledWith(entry);
});

function createWriteHarness() {
  const stores = new Map(
    ['media_library', 'thumbnails', 'web_snapshots'].map((name) => [name, createStore()])
  );
  const tx: BackupTransaction = {
    objectStore: (storeName) => {
      const store = stores.get(storeName);

      if (!store) {
        throw new Error(`Unknown store ${storeName}`);
      }

      return store;
    },
  };

  getStoreMock.mockImplementation((transaction: BackupTransaction, storeName: string) =>
    transaction.objectStore(storeName)
  );

  return { stores, tx };
}

function createStore(): BackupObjectStore {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    index: vi.fn(() => ({ getAll: vi.fn(async () => []) })),
    put: vi.fn(),
  };
}

function createWebSnapshotMediaEntry(): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 1,
    duration: null,
    filename: 'snapshot.zip',
    height: null,
    id: 'web-snapshot:snapshot-1',
    kind: 'web-archive',
    mimeType: 'application/zip',
    originalFilename: 'snapshot.zip',
    size: 16,
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 2,
    width: null,
  };
}

function createWebSnapshotRecord(): WebSnapshotRecord {
  const packageBlob = new Blob(['zip'], { type: 'application/zip' });

  return {
    createdAt: 1,
    id: 'snapshot-1',
    manifest: createWebSnapshotManifest({
      id: 'snapshot-1',
      source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    }),
    packageBlob,
    size: packageBlob.size,
    updatedAt: 2,
  };
}
