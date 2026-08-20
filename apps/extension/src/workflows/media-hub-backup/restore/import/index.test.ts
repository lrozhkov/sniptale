import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { MediaHubBackupMetadata } from '../../contracts/types';

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
  recoverAssetPublicationsMock,
  createBackupRestoreOperationMock,
  transitionAssetOperationMock,
  assertAssetWriteAdmissionMock,
  createAssetPublicationJournalMock,
  writeBlobToAssetMock,
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
  recoverAssetPublicationsMock: vi.fn(),
  createBackupRestoreOperationMock: vi.fn(),
  transitionAssetOperationMock: vi.fn(),
  assertAssetWriteAdmissionMock: vi.fn(),
  createAssetPublicationJournalMock: vi.fn(),
  writeBlobToAssetMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal()),
  assertAssetWriteAdmission: assertAssetWriteAdmissionMock,
  createAssetPublicationJournal: createAssetPublicationJournalMock,
  writeBlobToAsset: writeBlobToAssetMock,
}));
vi.mock('../asset-stream', () => ({
  writeBackupArchiveEntryToAsset: writeBlobToAssetMock,
}));

vi.mock('../../../../composition/persistence/assets/operations', async (importOriginal) => ({
  ...(await importOriginal()),
  createBackupRestoreOperation: createBackupRestoreOperationMock,
  transitionAssetOperation: transitionAssetOperationMock,
}));

vi.mock(
  '../../../../composition/persistence/asset-publication-recovery',
  async (importOriginal) => ({
    ...(await importOriginal()),
    recoverAssetPublications: recoverAssetPublicationsMock,
  })
);

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

vi.mock('../records/builders', () => ({
  createProjectAssetStoreEntry: createProjectAssetStoreEntryMock,
  createProjectExportStoreEntry: createProjectExportStoreEntryMock,
  createRecordingStoreEntry: createRecordingStoreEntryMock,
  createThumbnailStoreEntry: createThumbnailStoreEntryMock,
}));

vi.mock('../../storage', () => ({
  getStore: getStoreMock,
}));

vi.mock('../../../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: withMediaHubWriteGuardMock,
}));

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<Omit<MediaLibraryEntry, 'blob'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
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
    ...overrides,
  };
}

function createWriteHarness() {
  const stores = new Map(
    [
      'asset_refs',
      'asset_owners',
      'asset_operations',
      'media_library',
      'recordings',
      'recording_telemetry',
      'project_assets',
      'project_exports',
      'thumbnails',
      'image_workspaces',
      'aggregate_presentations',
    ].map((name) => [
      name,
      {
        delete: vi.fn(),
        get: vi.fn(),
        index: vi.fn(() => ({ getAll: vi.fn().mockResolvedValue([]) })),
        put: vi.fn(),
      },
    ])
  );
  const tx = {
    done: Promise.resolve(),
  };
  stores.get('asset_operations')?.get.mockResolvedValue({
    compensations: [],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: [],
    operationId: 'restore-1',
    status: 'pending',
    updatedAt: 1,
  });

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

async function importRestoreModule() {
  return import('..');
}

beforeEach(() => {
  createProjectAssetStoreEntryMock.mockReset();
  createProjectExportStoreEntryMock.mockReset();
  createRecordingStoreEntryMock.mockReset();
  createThumbnailStoreEntryMock.mockReset();
  getMediaLibraryEntryMock.mockReset();
  getStoreMock.mockReset();
  initDBMock.mockReset();
  publishMediaHubLibraryChangedMock.mockReset();
  withMediaHubWriteGuardMock.mockReset();
  recoverAssetPublicationsMock.mockReset();
  createBackupRestoreOperationMock.mockReset();
  transitionAssetOperationMock.mockReset();
  recoverAssetPublicationsMock.mockResolvedValue(undefined);
  createBackupRestoreOperationMock.mockResolvedValue({
    operationId: 'restore-1',
    status: 'pending',
  });
  transitionAssetOperationMock.mockResolvedValue(undefined);
  assertAssetWriteAdmissionMock.mockResolvedValue(undefined);
  createAssetPublicationJournalMock.mockResolvedValue({ journalId: 'journal-1' });
  writeBlobToAssetMock.mockImplementation(
    ({ expectedSize = 5, mimeType = 'image/png' }: { expectedSize?: number; mimeType?: string }) =>
      Promise.resolve({
        ref: {
          assetId: 'asset-restored-1',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/asset-restored-1' },
          mimeType,
          sha256: null,
          size: expectedSize,
        },
      })
  );
  withMediaHubWriteGuardMock.mockImplementation(async (_operation, callback: () => Promise<void>) =>
    callback()
  );
  vi.restoreAllMocks();
});

describe('import media hub backup assets skip and replace flows', () => {
  it('skips conflicting assets when the import strategy is skip', async () => {
    const { importMediaHubBackupAssets } = await importRestoreModule();
    getMediaLibraryEntryMock.mockResolvedValue(createMediaEntry({ kind: 'screenshot' }));

    const result = await importMediaHubBackupAssets({
      metadata: createBackupMetadata(createMediaEntry({ kind: 'screenshot' })),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'skip',
      zip: createZip(),
    });

    expect(result).toEqual({
      conflictsResolved: 0,
      imported: 0,
      skipped: 1,
    });
    expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
  });

  it('replaces conflicting assets, restores records and publishes library changes', async () => {
    const { importMediaHubBackupAssets } = await importRestoreModule();
    const { stores } = createWriteHarness();
    getMediaLibraryEntryMock.mockResolvedValue(createMediaEntry({ kind: 'screenshot' }));
    createThumbnailStoreEntryMock.mockReturnValue({ id: 'thumb-record' });

    const result = await importMediaHubBackupAssets({
      metadata: createBackupMetadata(
        createMediaEntry({ kind: 'screenshot' }),
        'thumbnails/asset-1'
      ),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'replace',
      zip: createZip(),
    });

    expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('asset-1');
    expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('asset-1');
    expect(stores.get('media_library')?.put).toHaveBeenCalled();
    expect(stores.get('thumbnails')?.put).toHaveBeenCalledWith({ id: 'thumb-record' });
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', ['asset-1']);
    expect(result).toEqual({
      conflictsResolved: 1,
      imported: 1,
      skipped: 0,
    });
  });

  it('persists the complete project-asset rollback snapshot before a later batch can fail', async () => {
    const { importMediaHubBackupAssets } = await importRestoreModule();
    const { stores } = createWriteHarness();
    const existingEntry = createMediaEntry(
      { kind: 'project-asset', projectAssetId: 'project-asset-1' },
      { id: 'project-asset:project-asset-1', kind: 'image' }
    );
    const previousProjectAsset = {
      assetId: 'asset-old',
      createdAt: 1,
      id: 'project-asset-1',
      mimeType: 'image/png',
      size: 5,
    };
    const previousThumbnail = { blob: new Blob(['old-thumb']), id: existingEntry.id };
    const previousRef = {
      assetId: 'asset-old',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/asset-old' },
      mimeType: 'image/png',
      sha256: null,
      size: 5,
    };
    const previousOwner = {
      assetId: 'asset-old',
      ownerId: 'project-asset-1',
      ownerKind: 'project-asset',
      role: 'body',
    };
    getMediaLibraryEntryMock.mockResolvedValue(existingEntry);
    stores.get('media_library')?.get.mockResolvedValue(existingEntry);
    stores.get('project_assets')?.get.mockResolvedValue(previousProjectAsset);
    stores.get('thumbnails')?.get.mockResolvedValue(previousThumbnail);
    stores.get('asset_refs')?.get.mockResolvedValue(previousRef);
    stores.get('asset_owners')?.get.mockResolvedValue(previousOwner);
    createProjectAssetStoreEntryMock.mockReturnValue({
      ...previousProjectAsset,
      assetId: 'asset-restored-1',
    });

    await importMediaHubBackupAssets({
      metadata: createBackupMetadata(existingEntry, 'thumbnails/asset-1'),
      remapEntryForDuplicate: vi.fn((entry) => entry),
      strategy: 'replace',
      zip: createZip(),
    });

    expect(stores.get('asset_operations')?.put).toHaveBeenCalledWith(
      expect.objectContaining({
        compensations: [
          expect.objectContaining({
            previousRecords: expect.objectContaining({
              assetOwnerEntry: previousOwner,
              assetRefEntry: previousRef,
              mediaLibraryEntry: existingEntry,
              projectAssetEntry: previousProjectAsset,
              thumbnailEntry: previousThumbnail,
            }),
          }),
        ],
      })
    );
  });
});

describe('import media hub backup assets duplicate flows', () => {
  it('duplicates conflicting assets through the remap callback', async () => {
    const { importMediaHubBackupAssets } = await importRestoreModule();
    const { stores } = createWriteHarness();
    const remappedEntry = createMediaEntry(
      { kind: 'project-asset', projectAssetId: 'project-asset-imported' },
      { id: 'project-asset:project-asset-imported', kind: 'image' }
    );
    const remapEntryForDuplicate = vi.fn().mockReturnValue(remappedEntry);
    getMediaLibraryEntryMock.mockResolvedValue(createMediaEntry({ kind: 'screenshot' }));
    createProjectAssetStoreEntryMock.mockReturnValue({ id: 'asset-record' });

    const result = await importMediaHubBackupAssets({
      metadata: createBackupMetadata(
        createMediaEntry(
          { kind: 'project-asset', projectAssetId: 'project-asset-1' },
          { id: 'project-asset:project-asset-1', kind: 'image' }
        )
      ),
      remapEntryForDuplicate,
      strategy: 'duplicate',
      zip: createZip(),
    });

    expect(remapEntryForDuplicate).toHaveBeenCalled();
    expect(stores.get('project_assets')?.put).toHaveBeenCalledWith({ id: 'asset-record' });
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', [remappedEntry.id]);
    expect(result).toEqual({
      conflictsResolved: 1,
      imported: 1,
      skipped: 0,
    });
  });
});
