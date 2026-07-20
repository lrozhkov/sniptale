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
} = vi.hoisted(() => ({
  createRecordingStoreEntryMock: vi.fn(),
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
  return zip;
}

beforeEach(() => {
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
  createRecordingStoreEntryMock.mockReset();
  getMediaLibraryEntryMock.mockReset();
  getStoreMock.mockReset();
  initDBMock.mockReset();
  publishMediaHubLibraryChangedMock.mockReset();
  withMediaHubWriteGuardMock.mockReset();
  initDBMock.mockResolvedValue({
    transaction: vi.fn().mockReturnValue({ done: Promise.resolve() }),
  });
  getStoreMock.mockImplementation((_tx, storeName: string) => {
    const store = stores.get(storeName);
    if (!store) {
      throw new Error(`Unknown store ${storeName}`);
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
