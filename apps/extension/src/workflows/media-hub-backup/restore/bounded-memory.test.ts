import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createBoundedMemoryMediaEntry,
  createMultiAssetBackupMetadata,
} from './bounded-memory.test-support';

const {
  createProjectAssetStoreEntryMock,
  createProjectExportStoreEntryMock,
  createRecordingStoreEntryMock,
  createThumbnailStoreEntryMock,
  getMediaLibraryEntryMock,
  getStoreMock,
  initDBMock,
  publishMediaHubLibraryChangedMock,
  withMediaHubWriteGuardMock,
} = vi.hoisted(() => ({
  createProjectAssetStoreEntryMock: vi.fn(),
  createProjectExportStoreEntryMock: vi.fn(),
  createRecordingStoreEntryMock: vi.fn(),
  createThumbnailStoreEntryMock: vi.fn(),
  getMediaLibraryEntryMock: vi.fn(),
  getStoreMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: initDBMock,
  })
);

vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),
  getMediaLibraryEntry: getMediaLibraryEntryMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
  publishMediaHubStorageAlert: vi.fn(),
  subscribeToMediaHubEvents: vi.fn(),
}));

vi.mock('./records/builders', () => ({
  createProjectAssetStoreEntry: createProjectAssetStoreEntryMock,
  createProjectExportStoreEntry: createProjectExportStoreEntryMock,
  createRecordingStoreEntry: createRecordingStoreEntryMock,
  createThumbnailStoreEntry: createThumbnailStoreEntryMock,
}));

vi.mock('../storage', () => ({
  getStore: getStoreMock,
}));

vi.mock('../../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: withMediaHubWriteGuardMock,
}));

function createWriteHarness() {
  const stores = new Map(
    [
      'media_library',
      'recordings',
      'recording_telemetry',
      'project_assets',
      'project_exports',
      'thumbnails',
      'web_snapshots',
    ].map((name) => [name, { delete: vi.fn(), get: vi.fn(), put: vi.fn() }])
  );
  const tx = {
    done: Promise.resolve(),
  };

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

  return { stores };
}

function createInspectableZip(
  entries: Record<string, Blob>,
  loadedPaths: string[],
  failingPaths = new Set<string>()
): JSZip {
  const zip = new JSZip();
  vi.spyOn(zip, 'file').mockImplementation(((path: string) => {
    const blob = entries[path];
    if (!blob) {
      return null;
    }

    return {
      async: vi.fn().mockImplementation(async () => {
        if (failingPaths.has(path)) {
          throw new Error('load failed');
        }

        loadedPaths.push(path);
        return blob;
      }),
    };
  }) as JSZip['file']);
  return zip;
}

async function importRestoreModule() {
  return import('.');
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  withMediaHubWriteGuardMock.mockImplementation(async (_operation, callback: () => Promise<void>) =>
    callback()
  );
});

it('does not load all standalone asset blobs before the first write', async () => {
  const { importMediaHubBackupAssets } = await importRestoreModule();
  const { stores } = createWriteHarness();
  const firstEntry = createBoundedMemoryMediaEntry({ kind: 'screenshot' }, { id: 'asset-1' });
  const secondEntry = createBoundedMemoryMediaEntry({ kind: 'screenshot' }, { id: 'asset-2' });
  const loadedPaths: string[] = [];
  getMediaLibraryEntryMock.mockResolvedValue(undefined);
  stores.get('media_library')?.put.mockImplementationOnce(async () => {
    expect(loadedPaths).toEqual(['assets/asset-1']);
  });

  await expect(
    importMediaHubBackupAssets({
      metadata: createMultiAssetBackupMetadata([firstEntry, secondEntry]),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'replace',
      zip: createInspectableZip(
        {
          'assets/asset-1': new Blob(['first']),
          'assets/asset-2': new Blob(['second']),
        },
        loadedPaths
      ),
    })
  ).resolves.toEqual({ conflictsResolved: 0, imported: 2, skipped: 0 });

  expect(loadedPaths).toEqual(['assets/asset-1', 'assets/asset-2']);
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', ['asset-1', 'asset-2']);
});

it('compensates already imported standalone batches when a later batch fails', async () => {
  const { importMediaHubBackupAssets } = await importRestoreModule();
  const { stores } = createWriteHarness();
  const firstEntry = createBoundedMemoryMediaEntry({ kind: 'screenshot' }, { id: 'asset-1' });
  const secondEntry = createBoundedMemoryMediaEntry({ kind: 'screenshot' }, { id: 'asset-2' });
  getMediaLibraryEntryMock.mockResolvedValue(undefined);
  stores
    .get('media_library')
    ?.put.mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('write failed'));

  await expect(
    importMediaHubBackupAssets({
      metadata: createMultiAssetBackupMetadata([firstEntry, secondEntry]),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'replace',
      zip: createInspectableZip(
        {
          'assets/asset-1': new Blob(['first']),
          'assets/asset-2': new Blob(['second']),
        },
        []
      ),
    })
  ).rejects.toThrow('write failed');

  expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('asset-1');
  expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('asset-2');
  expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('restores replaced records when a later standalone batch fails before writing', async () => {
  const { importMediaHubBackupAssets } = await importRestoreModule();
  const { stores } = createWriteHarness();
  const firstEntry = createBoundedMemoryMediaEntry({ kind: 'screenshot' }, { id: 'asset-1' });
  const secondEntry = createBoundedMemoryMediaEntry({ kind: 'screenshot' }, { id: 'asset-2' });
  const previousMediaRecord = { ...firstEntry, blob: new Blob(['previous-first']) };
  const previousThumbnailRecord = { assetId: 'asset-1', blob: new Blob(['previous-thumb']) };
  getMediaLibraryEntryMock.mockImplementation(async (id: string) =>
    id === 'asset-1' || id === 'asset-2'
      ? createBoundedMemoryMediaEntry({ kind: 'screenshot' }, { id })
      : undefined
  );
  stores
    .get('media_library')
    ?.get.mockImplementation(async (id: string) =>
      id === 'asset-1' ? previousMediaRecord : undefined
    );
  stores
    .get('thumbnails')
    ?.get.mockImplementation(async (id: string) =>
      id === 'asset-1' ? previousThumbnailRecord : undefined
    );

  await expect(
    importMediaHubBackupAssets({
      metadata: createMultiAssetBackupMetadata([firstEntry, secondEntry]),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'replace',
      zip: createInspectableZip(
        {
          'assets/asset-1': new Blob(['first']),
          'assets/asset-2': new Blob(['second']),
        },
        [],
        new Set(['assets/asset-2'])
      ),
    })
  ).rejects.toThrow('load failed');

  expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('asset-1');
  expect(stores.get('media_library')?.delete).not.toHaveBeenCalledWith('asset-2');
  expect(stores.get('media_library')?.put).toHaveBeenCalledWith(previousMediaRecord);
  expect(stores.get('thumbnails')?.put).toHaveBeenCalledWith(previousThumbnailRecord);
  expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
});

it('restores replaced records when the current standalone batch fails after delete', async () => {
  const { importMediaHubBackupAssets } = await importRestoreModule();
  const stores = createWriteHarness().stores;
  const entry = createBoundedMemoryMediaEntry({ kind: 'screenshot' }, { id: 'asset-1' });
  const previousMediaRecord = { ...entry, blob: new Blob(['previous']) };
  getMediaLibraryEntryMock.mockResolvedValue(createBoundedMemoryMediaEntry({ kind: 'screenshot' }));
  stores.get('media_library')?.get.mockResolvedValue(previousMediaRecord);
  stores.get('media_library')?.put.mockRejectedValueOnce(new Error('write failed'));
  await expect(
    importMediaHubBackupAssets({
      metadata: createMultiAssetBackupMetadata([entry]),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'replace',
      zip: createInspectableZip({ 'assets/asset-1': new Blob(['next']) }, []),
    })
  ).rejects.toThrow('write failed');
  expect(stores.get('media_library')?.put).toHaveBeenCalledWith(previousMediaRecord);
});
