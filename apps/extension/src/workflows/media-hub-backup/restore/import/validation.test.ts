import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { MediaHubBackupMetadata } from '../../contracts/types';

const {
  getMediaLibraryEntryMock,
  getStoreMock,
  initDBMock,
  publishMediaHubLibraryChangedMock,
  withMediaHubWriteGuardMock,
} = vi.hoisted(() => ({
  getMediaLibraryEntryMock: vi.fn(),
  getStoreMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: initDBMock,
  })
);

vi.mock('../../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/media-library/index')
  >()),
  getMediaLibraryEntry: getMediaLibraryEntryMock,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
  publishMediaHubStorageAlert: vi.fn(),
  subscribeToMediaHubEvents: vi.fn(),
}));

vi.mock('../../storage', () => ({
  getStore: getStoreMock,
}));

vi.mock('../../../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: withMediaHubWriteGuardMock,
}));

function createMediaEntry(source: MediaLibraryEntry['source']): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 1080,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 123,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
  };
}

function createWriteHarness() {
  const stores = new Map(
    ['media_library', 'thumbnails'].map((name) => [
      name,
      { delete: vi.fn(), get: vi.fn(), put: vi.fn() },
    ])
  );
  const tx = { done: Promise.resolve() };

  initDBMock.mockResolvedValue({
    transaction: vi.fn().mockReturnValue(tx),
  });
  getStoreMock.mockImplementation((_tx, storeName: string) => {
    const store = stores.get(storeName);
    if (!store) {
      throw new Error(`Unknown store ${storeName}`);
    }

    return store;
  });

  return stores;
}

function createZip(args: { assetBlob?: Blob | null; thumbnailBlob?: Blob | null } = {}): JSZip {
  const assetBlob = 'assetBlob' in args ? args.assetBlob : new Uint8Array([1]);
  const thumbnailBlob = 'thumbnailBlob' in args ? args.thumbnailBlob : new Uint8Array([2]);
  const zip = new JSZip();

  if (assetBlob !== null) {
    zip.file('assets/asset-1', assetBlob);
  }
  if (thumbnailBlob !== null) {
    zip.file('thumbnails/asset-1', thumbnailBlob);
  }

  return zip;
}

function createBackupMetadata(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  thumbnailPath: string | null = null
): MediaHubBackupMetadata {
  return {
    assets: [
      {
        assetPath: 'assets/asset-1',
        entry,
        thumbnailPath,
      },
    ],
    effectBundles: [],
  };
}

beforeEach(() => {
  getMediaLibraryEntryMock.mockReset();
  getStoreMock.mockReset();
  initDBMock.mockReset();
  publishMediaHubLibraryChangedMock.mockReset();
  withMediaHubWriteGuardMock.mockReset();
  withMediaHubWriteGuardMock.mockImplementation(async (_operation, callback: () => Promise<void>) =>
    callback()
  );
  vi.restoreAllMocks();
});

it('fails when the archive asset blob is missing', async () => {
  const { importMediaHubBackupAssets } = await import('..');
  getMediaLibraryEntryMock.mockResolvedValue(undefined);

  await expect(
    importMediaHubBackupAssets({
      metadata: createBackupMetadata(createMediaEntry({ kind: 'screenshot' })),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'replace',
      zip: createZip({ assetBlob: null }),
    })
  ).rejects.toThrow('shared.mediaHub.backupAssetBlobMissingPrefix asset.png.');
  expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('does not delete existing assets when validation fails before the transaction starts', async () => {
  const { importMediaHubBackupAssets } = await import('..');
  const stores = createWriteHarness();
  getMediaLibraryEntryMock.mockResolvedValue(createMediaEntry({ kind: 'screenshot' }));

  await expect(
    importMediaHubBackupAssets({
      metadata: createBackupMetadata(createMediaEntry({ kind: 'screenshot' })),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'replace',
      zip: createZip({ assetBlob: null }),
    })
  ).rejects.toThrow('shared.mediaHub.backupAssetBlobMissingPrefix asset.png.');

  expect(stores.get('media_library')?.delete).not.toHaveBeenCalled();
  expect(stores.get('media_library')?.put).not.toHaveBeenCalled();
});

it('fails when an expected thumbnail blob is missing before the transaction starts', async () => {
  const { importMediaHubBackupAssets } = await import('..');
  const stores = createWriteHarness();
  getMediaLibraryEntryMock.mockResolvedValue(undefined);

  await expect(
    importMediaHubBackupAssets({
      metadata: createBackupMetadata(
        createMediaEntry({ kind: 'screenshot' }),
        'thumbnails/asset-1'
      ),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'replace',
      zip: createZip({ thumbnailBlob: null }),
    })
  ).rejects.toThrow('shared.mediaHub.backupAssetBlobMissingPrefix thumbnails/asset-1.');

  expect(initDBMock).not.toHaveBeenCalled();
  expect(stores.get('media_library')?.put).not.toHaveBeenCalled();
});
