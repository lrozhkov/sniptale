import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { MediaHubBackupMetadata } from '../../contracts/types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const {
  createRecordingStoreEntryMock,
  getMediaLibraryEntryMock,
  getStoreMock,
  initDBMock,
  publishMediaHubLibraryChangedMock,
  withMediaHubWriteGuardMock,
  createBackupRestoreOperationMock,
  transitionAssetOperationMock,
  writeBlobToAssetMock,
  prepareAssetPublicationMock,
  recoverAssetPublicationsMock,
  deleteAssetObjectMock,
} = vi.hoisted(() => ({
  createRecordingStoreEntryMock: vi.fn(),
  getMediaLibraryEntryMock: vi.fn(),
  getStoreMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
  createBackupRestoreOperationMock: vi.fn(),
  transitionAssetOperationMock: vi.fn(),
  writeBlobToAssetMock: vi.fn(),
  prepareAssetPublicationMock: vi.fn(),
  recoverAssetPublicationsMock: vi.fn(),
  deleteAssetObjectMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets/operations', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/assets/operations')
  >()),
  createBackupRestoreOperation: createBackupRestoreOperationMock,
  transitionAssetOperation: transitionAssetOperationMock,
}));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  assertAssetWriteAdmission: vi.fn(),
  deleteAssetObject: deleteAssetObjectMock,
  deleteReadyJournal: vi.fn(async () => undefined),
  createAssetPublicationJournal: prepareAssetPublicationMock,
  releaseAssetReadyProtection: vi.fn(),
  writeBlobToAsset: writeBlobToAssetMock,
}));
vi.mock('../../../../composition/persistence/asset-publication-recovery', () => ({
  recoverAssetPublications: recoverAssetPublicationsMock,
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
vi.mock('../records/builders', () => ({
  createProjectAssetStoreEntry: vi.fn(),
  createProjectExportStoreEntry: vi.fn(),
  createRecordingStoreEntry: createRecordingStoreEntryMock,
  createThumbnailStoreEntry: vi.fn(),
}));
vi.mock('../../storage', () => ({ getStore: getStoreMock }));
vi.mock('../../../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: withMediaHubWriteGuardMock,
}));

function createRecordingEntry(recordingId: string): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: null,
    filename: 'capture.webm',
    height: 1080,
    id: `recording:${recordingId}`,
    kind: 'video',
    mimeType: 'video/webm',
    originalFilename: 'capture.webm',
    size: 123,
    source: { kind: 'recording', recordingId },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
  };
}

function createRecordingTelemetry(recordingId = 'recording-1'): RecordingTelemetryEntry {
  return {
    actionEvents: [],
    captureMode: CaptureMode.TAB,
    createdAt: 1,
    cursorTrack: null,
    recordingId,
    signals: [],
    updatedAt: 2,
    viewport: null,
  };
}

function createZip(): JSZip {
  const zip = new JSZip();
  zip.file('assets/asset-1', new Uint8Array([1]));
  zip.file('assets/asset-2', new Uint8Array([2]));
  return zip;
}

beforeEach(() => {
  vi.clearAllMocks();
  const stores = new Map(
    [
      'media_library',
      'asset_refs',
      'asset_owners',
      'asset_operations',
      'recordings',
      'recording_telemetry',
      'project_assets',
      'project_exports',
      'thumbnails',
      'web_snapshots',
    ].map((name) => [name, { delete: vi.fn(), get: vi.fn(), put: vi.fn() }])
  );
  createRecordingStoreEntryMock.mockReset();
  getMediaLibraryEntryMock.mockReset();
  getStoreMock.mockReset();
  initDBMock.mockReset();
  publishMediaHubLibraryChangedMock.mockReset();
  withMediaHubWriteGuardMock.mockReset();
  createBackupRestoreOperationMock.mockResolvedValue({
    compensations: [],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: [],
    operationId: 'restore-1',
    status: 'pending',
    updatedAt: 1,
  });
  transitionAssetOperationMock.mockResolvedValue(undefined);
  writeBlobToAssetMock.mockResolvedValue({
    ref: {
      assetId: 'asset-restored',
      createdAt: 1,
      location: { kind: 'opfs', objectKey: 'objects/asset-restored' },
      mimeType: 'video/webm',
      sha256: null,
      size: 1,
    },
  });
  prepareAssetPublicationMock.mockResolvedValue({ journalId: 'journal-1' });
  recoverAssetPublicationsMock.mockResolvedValue(0);
  deleteAssetObjectMock.mockResolvedValue(undefined);
  initDBMock.mockResolvedValue({
    transaction: vi.fn().mockReturnValue({ done: Promise.resolve() }),
  });
  getStoreMock.mockImplementation((_tx, storeName: string) => {
    const store = stores.get(storeName);
    if (!store) {
      throw new Error(`Unknown store ${storeName}`);
    }

    if (storeName === 'asset_operations') {
      store.get.mockResolvedValue({
        compensations: [],
        createdAt: 1,
        kind: 'backup-restore',
        obsoleteAssetIds: [],
        operationId: 'restore-1',
        status: 'pending',
        updatedAt: 1,
      });
    }
    return store;
  });
  withMediaHubWriteGuardMock.mockImplementation(async (_operation, callback: () => Promise<void>) =>
    callback()
  );
});

it('remaps recording telemetry sidecars when duplicating recording assets', async () => {
  const remappedEntry = createRecordingEntry('recording-imported');
  const remapEntryForDuplicate = vi.fn().mockReturnValue(remappedEntry);
  getMediaLibraryEntryMock.mockResolvedValue(createRecordingEntry('recording-1'));
  createRecordingStoreEntryMock.mockReturnValue({ id: 'recording-record' });

  const metadata: MediaHubBackupMetadata = {
    assets: [
      {
        assetPath: 'assets/asset-1',
        entry: createRecordingEntry('recording-1'),
        recordingTelemetry: createRecordingTelemetry(),
        thumbnailPath: null,
      },
    ],
    effectBundles: [],
  };

  const { importMediaHubBackupAssets } = await import('..');
  const result = await importMediaHubBackupAssets({
    metadata,
    remapEntryForDuplicate,
    strategy: 'duplicate',
    zip: createZip(),
  });

  expect(getStoreMock).toHaveBeenCalled();
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', [remappedEntry.id]);
  expect(result).toEqual({
    conflictsResolved: 1,
    imported: 1,
    skipped: 0,
  });
});

it('does not compensate bytes before the durable restore operation is aborted', async () => {
  const originalGetStore = getStoreMock.getMockImplementation();
  getStoreMock.mockImplementation((tx, storeName: string) => {
    const store = originalGetStore?.(tx, storeName);
    if (storeName === 'recordings') {
      store.put.mockRejectedValueOnce(new Error('recording write failed'));
    }
    return store;
  });
  transitionAssetOperationMock.mockRejectedValueOnce(new Error('abort transition failed'));
  getMediaLibraryEntryMock.mockResolvedValue(undefined);
  createRecordingStoreEntryMock.mockReturnValue({ id: 'recording-record' });

  const { importMediaHubBackupAssets } = await import('..');
  const restore = importMediaHubBackupAssets({
    metadata: {
      assets: [
        {
          assetPath: 'assets/asset-1',
          entry: createRecordingEntry('recording-1'),
          thumbnailPath: null,
        },
      ],
      effectBundles: [],
    },
    remapEntryForDuplicate: vi.fn((entry) => entry),
    strategy: 'replace',
    zip: createZip(),
  });

  await expect(restore).rejects.toMatchObject({
    errors: [expect.any(Error), expect.objectContaining({ message: 'abort transition failed' })],
  });
  expect(transitionAssetOperationMock).toHaveBeenCalledWith('restore-1', 'pending', 'aborted');
  expect(deleteAssetObjectMock).not.toHaveBeenCalled();
});

it('consumes aborted durable compensation before a successful retry can publish', async () => {
  const originalGetStore = getStoreMock.getMockImplementation();
  const recordingStore = originalGetStore?.(undefined, 'recordings');
  recordingStore.put
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('second recording write failed'));
  getMediaLibraryEntryMock.mockResolvedValue(undefined);
  createRecordingStoreEntryMock.mockReturnValue({ id: 'recording-record' });
  const args = {
    metadata: {
      assets: [
        {
          assetPath: 'assets/asset-1',
          entry: createRecordingEntry('recording-1'),
          thumbnailPath: null,
        },
        {
          assetPath: 'assets/asset-2',
          entry: createRecordingEntry('recording-2'),
          thumbnailPath: null,
        },
      ],
      effectBundles: [],
    } satisfies MediaHubBackupMetadata,
    remapEntryForDuplicate: vi.fn((entry) => entry),
    strategy: 'replace' as const,
    zip: createZip(),
  };
  const { importMediaHubBackupAssets } = await import('..');

  await expect(importMediaHubBackupAssets(args)).rejects.toThrow('second recording write failed');
  await expect(importMediaHubBackupAssets(args)).resolves.toEqual(
    expect.objectContaining({ imported: 2 })
  );

  expect(transitionAssetOperationMock).toHaveBeenNthCalledWith(
    1,
    'restore-1',
    'pending',
    'aborted'
  );
  expect(recoverAssetPublicationsMock).toHaveBeenCalledTimes(4);
  expect(transitionAssetOperationMock.mock.invocationCallOrder[0]).toBeLessThan(
    recoverAssetPublicationsMock.mock.invocationCallOrder[1] ?? 0
  );
  expect(recoverAssetPublicationsMock.mock.invocationCallOrder[1]).toBeLessThan(
    createBackupRestoreOperationMock.mock.invocationCallOrder[1] ?? 0
  );
  expect(deleteAssetObjectMock).not.toHaveBeenCalled();
});
