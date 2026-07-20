import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry, MediaThumbnailEntry } from './contracts';
import type { ProjectAssetEntry, ProjectExportEntry } from '../projects/contracts';
import type { RecordingEntry } from '../recordings/contracts';
import { createVideoProject } from '../projects/index.test-support';

const dbMocks = vi.hoisted(() => ({
  deleteProjectAssetMock: vi.fn(),
  deleteProjectExportMock: vi.fn(),
  deleteRecordingMock: vi.fn(),
  getAllKeysMock: vi.fn(),
  getAllMock: vi.fn(),
  getMock: vi.fn(),
  getProjectAssetMock: vi.fn(),
  getRecordingMock: vi.fn(),
  initDBMock: vi.fn(),
  listAllProjectExportsMock: vi.fn(),
  listProjectAssetsMock: vi.fn(),
  listVideoProjectReadResultsMock: vi.fn(),
  listRecordingsMock: vi.fn(),
  objectStoreDeleteMock: vi.fn(),
  putMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txPutMock: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  initDB: dbMocks.initDBMock,
}));
vi.mock('../projects/index', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteProjectAsset: dbMocks.deleteProjectAssetMock,
  deleteProjectExport: dbMocks.deleteProjectExportMock,
  getProjectAsset: dbMocks.getProjectAssetMock,
  listAllProjectExports: dbMocks.listAllProjectExportsMock,
  listProjectAssets: dbMocks.listProjectAssetsMock,
  listVideoProjectReadResults: dbMocks.listVideoProjectReadResultsMock,
}));
vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteRecording: dbMocks.deleteRecordingMock,
  getRecording: dbMocks.getRecordingMock,
  listRecordings: dbMocks.listRecordingsMock,
}));
vi.mock('../web-snapshots', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteWebSnapshotMediaAsset: vi.fn(),
  getWebSnapshotRecord: vi.fn(),
}));
function createRecording(id: string): RecordingEntry {
  return {
    id,
    blob: new Blob([id], { type: 'video/webm' }),
    filename: `${id}.webm`,
    createdAt: id === 'rec-1' ? 100 : 200,
    size: 10,
  };
}
function createProjectExport(id: string, recordingId: string): ProjectExportEntry {
  return {
    id,
    projectId: 'project-1',
    recordingId,
    filename: `${id}.webm`,
    createdAt: 300,
    size: 12,
    duration: 40,
    width: 1920,
    height: 1080,
    fps: 30,
  };
}
function createProjectAsset(
  id: string,
  filename = `${id}.png`
): ProjectAssetEntry & { filename: string } {
  return {
    id,
    blob: new Blob([id], { type: 'image/png' }),
    mimeType: 'image/png',
    createdAt: 400,
    size: 8,
    filename,
  };
}
function createMediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    id: overrides.id ?? 'recording:rec-1',
    kind: overrides.kind ?? 'recording',
    source: overrides.source ?? { kind: 'recording', recordingId: 'rec-1' },
    filename: overrides.filename ?? 'rec-1.webm',
    originalFilename: overrides.originalFilename ?? 'rec-1.webm',
    createdAt: overrides.createdAt ?? 100,
    updatedAt: overrides.updatedAt ?? 100,
    size: overrides.size ?? 10,
    mimeType: overrides.mimeType ?? 'video/webm',
    width: overrides.width ?? null,
    height: overrides.height ?? null,
    duration: overrides.duration ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    sourceTitle: overrides.sourceTitle ?? null,
    sourceFavicon: overrides.sourceFavicon ?? null,
    tags: overrides.tags ?? [],
    ...(overrides.blob === undefined ? {} : { blob: overrides.blob }),
  };
}
function createThumbnail(assetId: string): MediaThumbnailEntry {
  return {
    assetId,
    blob: new Blob([assetId], { type: 'image/png' }),
    createdAt: 1,
    updatedAt: 1,
    width: 120,
    height: 90,
  };
}
function createDb() {
  return {
    get: dbMocks.getMock,
    getAll: dbMocks.getAllMock,
    getAllKeys: dbMocks.getAllKeysMock,
    put: dbMocks.putMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn((storeName: string) => ({
        delete: storeName === 'thumbnails' ? dbMocks.objectStoreDeleteMock : dbMocks.txDeleteMock,
        put: dbMocks.txPutMock,
      })),
    })),
  };
}
function resetMediaLibraryDbMocks() {
  vi.clearAllMocks();
  dbMocks.initDBMock.mockResolvedValue(createDb());
  dbMocks.listRecordingsMock.mockResolvedValue([]);
  dbMocks.listAllProjectExportsMock.mockResolvedValue([]);
  dbMocks.listProjectAssetsMock.mockResolvedValue([]);
  dbMocks.listVideoProjectReadResultsMock.mockResolvedValue([]);
}
async function importMediaLibraryModule() {
  vi.resetModules();
  return import('./index.library.ts');
}

function installLegacyMediaLibrarySourceMocks() {
  const recordingA = createRecording('rec-1');
  const recordingB = createRecording('rec-2');
  const projectExport = createProjectExport('exp-1', 'rec-2');
  const projectAsset = createProjectAsset('asset-1', 'custom-name.png');
  dbMocks.listRecordingsMock.mockResolvedValue([recordingA, recordingB]);
  dbMocks.listAllProjectExportsMock.mockResolvedValue([projectExport]);
  dbMocks.listProjectAssetsMock.mockResolvedValue([projectAsset]);
  dbMocks.getAllMock.mockResolvedValueOnce([
    createMediaEntry({
      id: 'recording:rec-1',
      filename: 'renamed.webm',
      originalFilename: 'rec-1.webm',
    }),
    createMediaEntry({
      id: 'export:stale-export',
      kind: 'export',
      source: {
        kind: 'project-export',
        exportId: 'stale-export',
        projectId: 'project-1',
        recordingId: 'stale-recording',
      },
    }),
  ]);
}

function expectLegacyMediaLibrarySyncWrites() {
  expect(dbMocks.txDeleteMock).toHaveBeenCalledWith('recording:rec-2');
  expect(dbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'recording:rec-1', filename: 'renamed.webm' })
  );
  expect(dbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'export:exp-1',
      source: {
        kind: 'project-export',
        exportId: 'exp-1',
        projectId: 'project-1',
        recordingId: 'rec-2',
      },
    })
  );
  expect(dbMocks.txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'project-asset:asset-1', filename: 'custom-name.png' })
  );
}

async function verifySyncLegacyMediaLibraryFlow() {
  installLegacyMediaLibrarySourceMocks();
  dbMocks.listVideoProjectReadResultsMock.mockResolvedValue([
    { status: 'notFound' },
    { project: createVideoProject(), status: 'ready' },
  ]);

  const { syncLegacyMediaLibrary } = await importMediaLibraryModule();
  await syncLegacyMediaLibrary();

  expectLegacyMediaLibrarySyncWrites();
  expect(dbMocks.txDeleteMock).toHaveBeenCalledWith('recording:rec-2');
  expect(dbMocks.txDeleteMock).toHaveBeenCalledWith('export:stale-export');
  expect(dbMocks.objectStoreDeleteMock).toHaveBeenCalledWith('recording:rec-2');
  expect(dbMocks.objectStoreDeleteMock).toHaveBeenCalledWith('export:stale-export');
}

async function verifyListMediaLibraryFlow() {
  const olderEntry = createMediaEntry({ id: 'recording:older', createdAt: 100, updatedAt: 100 });
  const newerEntry = createMediaEntry({
    id: 'recording:newer',
    createdAt: 200,
    updatedAt: 200,
    blob: new Blob(['raw']),
  });

  dbMocks.getAllMock.mockResolvedValueOnce([olderEntry, newerEntry]);
  dbMocks.getAllKeysMock.mockResolvedValue([createThumbnail('recording:newer').assetId]);

  const { listMediaLibrary } = await importMediaLibraryModule();
  await expect(listMediaLibrary()).resolves.toEqual([
    expect.objectContaining({ id: 'recording:newer', hasThumbnail: true }),
    expect.objectContaining({ id: 'recording:older', hasThumbnail: false }),
  ]);
  [
    dbMocks.listRecordingsMock,
    dbMocks.listAllProjectExportsMock,
    dbMocks.listProjectAssetsMock,
  ].forEach((mock) => expect(mock).not.toHaveBeenCalled());
}

async function verifyGetMediaAssetBlobFlow() {
  const { getMediaAssetBlob } = await importMediaLibraryModule();
  const screenshotBlob = new Blob(['screenshot'], { type: 'image/png' });
  const recordingBlob = new Blob(['recording'], { type: 'video/webm' });
  const projectAssetBlob = new Blob(['asset'], { type: 'image/png' });

  dbMocks.getMock
    .mockResolvedValueOnce(
      createMediaEntry({ source: { kind: 'screenshot' }, blob: screenshotBlob })
    )
    .mockResolvedValueOnce(
      createMediaEntry({ source: { kind: 'recording', recordingId: 'rec-1' } })
    )
    .mockResolvedValueOnce(
      createMediaEntry({
        source: {
          kind: 'project-export',
          exportId: 'exp-1',
          projectId: 'project-1',
          recordingId: 'rec-2',
        },
      })
    )
    .mockResolvedValueOnce(
      createMediaEntry({ source: { kind: 'project-asset', projectAssetId: 'asset-1' } })
    )
    .mockResolvedValueOnce(undefined);
  dbMocks.getRecordingMock
    .mockResolvedValueOnce({ blob: recordingBlob })
    .mockResolvedValueOnce({ blob: recordingBlob });
  dbMocks.getProjectAssetMock.mockResolvedValueOnce({ blob: projectAssetBlob });

  await expect(getMediaAssetBlob('screenshot')).resolves.toBe(screenshotBlob);
  await expect(getMediaAssetBlob('recording')).resolves.toBe(recordingBlob);
  await expect(getMediaAssetBlob('export')).resolves.toBe(recordingBlob);
  await expect(getMediaAssetBlob('asset')).resolves.toBe(projectAssetBlob);
  await expect(getMediaAssetBlob('missing')).resolves.toBeUndefined();
}

const mediaLibraryDbCases = [
  [
    'syncs legacy media library entries across recordings, exports, and assets',
    verifySyncLegacyMediaLibraryFlow,
  ],
  [
    'lists media library items with thumbnail state and newest-first ordering',
    verifyListMediaLibraryFlow,
  ],
  [
    'resolves media blobs for screenshots, recordings, exports, and project assets',
    verifyGetMediaAssetBlobFlow,
  ],
] as const;

describe('media-library-db.library', () => {
  beforeEach(resetMediaLibraryDbMocks);
  mediaLibraryDbCases.forEach(([title, testCase]) => it(title, testCase));
});
