import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { getStore } from '../../storage';

type BackupTransaction = Parameters<typeof getStore>[0];

const {
  createProjectAssetStoreEntryMock,
  createProjectExportStoreEntryMock,
  createRecordingStoreEntryMock,
  createThumbnailStoreEntryMock,
  getStoreMock,
} = vi.hoisted(() => ({
  createProjectAssetStoreEntryMock: vi.fn(),
  createProjectExportStoreEntryMock: vi.fn(),
  createRecordingStoreEntryMock: vi.fn(),
  createThumbnailStoreEntryMock: vi.fn(),
  getStoreMock: vi.fn(),
}));

vi.mock('../records/builders', () => ({
  createProjectAssetStoreEntry: createProjectAssetStoreEntryMock,
  createProjectExportStoreEntry: createProjectExportStoreEntryMock,
  createRecordingStoreEntry: createRecordingStoreEntryMock,
  createThumbnailStoreEntry: createThumbnailStoreEntryMock,
}));

vi.mock('../../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage')>()),
  getStore: getStoreMock,
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

function createWriteHarness(): {
  stores: Map<string, ReturnType<typeof createHarnessStore>>;
  tx: BackupTransaction;
} {
  const stores = new Map(
    [
      'media_library',
      'recordings',
      'recording_telemetry',
      'project_assets',
      'project_exports',
      'thumbnails',
      'web_snapshots',
    ].map((name) => [name, createHarnessStore()])
  );

  getStoreMock.mockImplementation((_tx, storeName: string) => {
    const store = stores.get(storeName);
    if (!store) {
      throw new Error(`Unknown store ${storeName}`);
    }

    return store;
  });

  return {
    stores,
    tx: {
      objectStore: () => createHarnessStore(),
    },
  };
}

function createHarnessStore() {
  return {
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => undefined),
    index: vi.fn(() => ({
      getAll: vi.fn(async () => []),
    })),
    put: vi.fn(async () => undefined),
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

beforeEach(() => {
  createProjectAssetStoreEntryMock.mockReset();
  createProjectExportStoreEntryMock.mockReset();
  createRecordingStoreEntryMock.mockReset();
  createThumbnailStoreEntryMock.mockReset();
  getStoreMock.mockReset();
});

it('returns the complete store list needed for import transactions', async () => {
  const { getImportTransactionStoreNames } = await import('.');

  expect(getImportTransactionStoreNames()).toEqual([
    'recordings',
    'recording_telemetry',
    'project_assets',
    'project_exports',
    'video_projects',
    'video_effect_bundles',
    'scenario_projects',
    'scenario_assets',
    'scenario_exports',
    'scenario_step_editor_documents',
    'web_snapshots',
    'media_library',
    'thumbnails',
  ]);
});

it('deletes existing recording records from the recordings store and shared indexes', async () => {
  const { deleteExistingAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness();

  await deleteExistingAssetRecord(
    tx,
    createMediaEntry(
      { kind: 'recording', recordingId: 'recording-1' },
      { id: 'recording:recording-1', kind: 'video' }
    )
  );

  expect(stores.get('recordings')?.delete).toHaveBeenCalledWith('recording-1');
  expect(stores.get('recording_telemetry')?.delete).toHaveBeenCalledWith('recording-1');
  expect(stores.get('project_exports')?.delete).not.toHaveBeenCalled();
  expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('recording:recording-1');
  expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('recording:recording-1');
});

it('deletes existing project-export records from all owning stores', async () => {
  const { deleteExistingAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness();

  await deleteExistingAssetRecord(
    tx,
    createMediaEntry(
      {
        kind: 'project-export',
        exportId: 'export-1',
        projectId: 'project-1',
        recordingId: 'recording-1',
      },
      { id: 'asset-1', kind: 'export' }
    )
  );

  expect(stores.get('recordings')?.delete).toHaveBeenCalledWith('recording-1');
  expect(stores.get('recording_telemetry')?.delete).toHaveBeenCalledWith('recording-1');
  expect(stores.get('project_exports')?.delete).toHaveBeenCalledWith('export-1');
  expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('asset-1');
  expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('asset-1');
});

it('deletes existing project-asset records from the project assets store and shared indexes', async () => {
  const { deleteExistingAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness();

  await deleteExistingAssetRecord(
    tx,
    createMediaEntry(
      { kind: 'project-asset', projectAssetId: 'project-asset-1' },
      { id: 'project-asset:project-asset-1', kind: 'image' }
    )
  );

  expect(stores.get('project_assets')?.delete).toHaveBeenCalledWith('project-asset-1');
  expect(stores.get('recordings')?.delete).not.toHaveBeenCalled();
  expect(stores.get('media_library')?.delete).toHaveBeenCalledWith('project-asset:project-asset-1');
  expect(stores.get('thumbnails')?.delete).toHaveBeenCalledWith('project-asset:project-asset-1');
});

it('restores screenshot records directly into the media library and thumbnails store', async () => {
  const { restoreAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness();
  const entry = createMediaEntry({ kind: 'screenshot' });
  const blob = new Blob(['asset']);
  const thumbnail = new Blob(['thumb']);

  createThumbnailStoreEntryMock.mockReturnValue({ id: 'thumb-record' });

  await restoreAssetRecord(tx, entry, blob, thumbnail, null);

  expect(stores.get('media_library')?.put).toHaveBeenCalledWith({
    ...entry,
    blob,
  });
  expect(stores.get('thumbnails')?.put).toHaveBeenCalledWith({ id: 'thumb-record' });
});

it('restores recording records through the recordings store and media library', async () => {
  const { writeMainAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness();
  const entry = createMediaEntry(
    { kind: 'recording', recordingId: 'recording-1' },
    { id: 'recording:recording-1', kind: 'video' }
  );
  const blob = new Blob(['asset']);
  const telemetry = createRecordingTelemetry();

  createRecordingStoreEntryMock.mockReturnValue({ id: 'recording-record' });

  await writeMainAssetRecord(tx, entry, blob, telemetry);

  expect(stores.get('recordings')?.put).toHaveBeenCalledWith({ id: 'recording-record' });
  expect(stores.get('recording_telemetry')?.put).toHaveBeenCalledWith(telemetry);
  expect(stores.get('media_library')?.put).toHaveBeenCalledWith(entry);
});

it('restores project-export records through recording and export builders', async () => {
  const { writeMainAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness();
  const entry = createMediaEntry(
    {
      kind: 'project-export',
      exportId: 'export-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
    },
    { id: 'asset-2', kind: 'export' }
  );
  const blob = new Blob(['asset']);

  createRecordingStoreEntryMock.mockReturnValue({ id: 'recording-record' });
  createProjectExportStoreEntryMock.mockReturnValue({ id: 'export-record' });

  await writeMainAssetRecord(tx, entry, blob, null);

  expect(stores.get('recordings')?.put).toHaveBeenCalledWith({ id: 'recording-record' });
  expect(stores.get('project_exports')?.put).toHaveBeenCalledWith({ id: 'export-record' });
  expect(stores.get('media_library')?.put).toHaveBeenCalledWith(entry);
});

it('restores project-asset records through the project assets store', async () => {
  const { writeMainAssetRecord } = await import('.');
  const { stores, tx } = createWriteHarness();
  const entry = createMediaEntry(
    { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    { id: 'project-asset:project-asset-1', kind: 'image' }
  );
  const blob = new Blob(['asset']);

  createProjectAssetStoreEntryMock.mockReturnValue({ id: 'asset-record' });

  await writeMainAssetRecord(tx, entry, blob, null);

  expect(stores.get('project_assets')?.put).toHaveBeenCalledWith({ id: 'asset-record' });
  expect(stores.get('media_library')?.put).toHaveBeenCalledWith(entry);
});

it('skips thumbnail writes when no thumbnail blob is present', async () => {
  const { writeThumbnailRecord } = await import('.');
  const { stores, tx } = createWriteHarness();

  await writeThumbnailRecord(tx, createMediaEntry({ kind: 'screenshot' }), null);

  expect(stores.get('thumbnails')?.put).not.toHaveBeenCalled();
});
