import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import { createWebSnapshotManifest } from '../../../../features/web-snapshot/manifest';
import type { PreparedBackupWebSnapshotRecord } from '../web-snapshot';
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

it('retains shared refs when replacing one web snapshot owner', async () => {
  const { deleteExistingAssetRecord } = await import('.');
  const harness = createWriteHarness({
    ownerCount: 1,
    webSnapshot: createStoredWebSnapshotRecord(),
  });

  await deleteExistingAssetRecord(harness.tx, createWebSnapshotMediaEntry());

  expect(harness.stores.get('asset_owners')?.delete).toHaveBeenCalledTimes(2);
  expect(harness.stores.get('asset_refs')?.delete).not.toHaveBeenCalled();
});

it('restores web snapshot records only with the required snapshot record', async () => {
  const { writeMainAssetRecord } = await import('.');
  const harness = createWriteHarness();
  const entry = createWebSnapshotMediaEntry();
  const snapshotRecord = createWebSnapshotRecord();

  await writeMainAssetRecord(
    harness.tx,
    entry,
    null,
    null,
    snapshotRecord,
    createPreparedPublication()
  );

  expect(harness.stores.get('web_snapshots')?.put).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'snapshot-1',
      packageAssetId: 'package-asset',
      screenshotAssetId: 'screenshot-asset',
    })
  );
  expect(harness.stores.get('asset_refs')?.put).toHaveBeenCalledTimes(2);
  expect(harness.stores.get('asset_owners')?.put).toHaveBeenCalledTimes(2);
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

function createWriteHarness(options: { ownerCount?: number; webSnapshot?: unknown } = {}) {
  const stores = new Map(
    ['asset_owners', 'asset_refs', 'media_library', 'thumbnails', 'web_snapshots'].map((name) => [
      name,
      createStore({
        getValue: name === 'web_snapshots' ? options.webSnapshot : undefined,
        ownerCount: options.ownerCount ?? 0,
      }),
    ])
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

function createStore(options: { getValue?: unknown; ownerCount?: number } = {}): BackupObjectStore {
  return {
    delete: vi.fn(),
    get: vi.fn(async () => options.getValue),
    index: vi.fn(() => ({
      getAll: vi.fn(async () => Array.from({ length: options.ownerCount ?? 0 }, () => ({}))),
    })),
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

function createWebSnapshotRecord(): PreparedBackupWebSnapshotRecord {
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

function createStoredWebSnapshotRecord() {
  return {
    createdAt: 1,
    id: 'snapshot-1',
    manifest: createWebSnapshotManifest({
      id: 'snapshot-1',
      source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    }),
    packageAssetId: 'package-old',
    screenshotAssetId: 'screenshot-old',
    screenshotMimeType: 'image/png',
    screenshotSize: 3,
    size: 3,
    updatedAt: 2,
  };
}

function createPreparedPublication() {
  const createAsset = (assetId: string, mimeType: string, size: number) => ({
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType,
      sha256: null,
      size,
    },
    writingMarker: {
      assetId,
      createdAt: 1,
      domain: 'backup-restore',
      markerId: `marker-${assetId}`,
      objectKey: `objects/${assetId}`,
    },
  });
  return {
    asset: createAsset('package-asset', 'application/zip', 3),
    additionalAssets: [createAsset('screenshot-asset', 'image/png', 3)],
    journalId: 'journal-1',
  };
}
