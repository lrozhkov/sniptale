import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from './contracts';
import type { MediaAssetProjectUsage } from './usage';

const dbMocks = vi.hoisted(() => ({
  listMediaAssetProjectUsageMock: vi.fn(async (): Promise<MediaAssetProjectUsage[]> => []),
  deleteCascadeMock: vi.fn(),
  deleteProjectAssetMock: vi.fn(),
  deleteProjectExportMock: vi.fn(),
  deleteRecordingMock: vi.fn(),
  getMock: vi.fn(),
  initDBMock: vi.fn(),
  objectStoreGetMock: vi.fn(),
  objectStoreDeleteMock: vi.fn(),
  putMock: vi.fn(),
  listReadyJournalsMock: vi.fn(),
  txDoneMock: vi.fn(),
}));
vi.mock('./usage', () => ({
  listMediaAssetProjectUsage: dbMocks.listMediaAssetProjectUsageMock,
}));
vi.mock('./delete-cascade', () => ({
  deleteMediaAssetWithProjectCascade: dbMocks.deleteCascadeMock,
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  listReadyJournals: dbMocks.listReadyJournalsMock,
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  AGGREGATE_PRESENTATIONS_STORE: 'aggregate_presentations',
  IMAGE_WORKSPACES_STORE: 'image_workspaces',
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  initDB: dbMocks.initDBMock,
}));

vi.mock('../projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects/index')>()),
  deleteProjectAsset: dbMocks.deleteProjectAssetMock,
  deleteProjectExport: dbMocks.deleteProjectExportMock,
  getProjectAsset: vi.fn(),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recordings/index')>()),
  deleteRecording: dbMocks.deleteRecordingMock,
  getRecording: vi.fn(),
}));

vi.mock('../web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../web-snapshots')>()),
  deleteWebSnapshotMediaAsset: vi.fn(),
  getWebSnapshotRecord: vi.fn(),
}));

import {
  MediaLibraryDeleteError,
  deleteMediaLibraryAsset,
  updateMediaLibraryEntry,
} from './index.library.ts';

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
    ...(overrides.lifecycle ? { lifecycle: overrides.lifecycle } : {}),
    ...(overrides.blob === undefined ? {} : { blob: overrides.blob }),
  };
}

function createDb() {
  return {
    get: dbMocks.getMock,
    put: dbMocks.putMock,
    transaction: vi.fn(() => ({
      done: dbMocks.txDoneMock(),
      objectStore: vi.fn(() => ({
        delete: dbMocks.objectStoreDeleteMock,
        get: dbMocks.objectStoreGetMock,
        put: dbMocks.putMock,
      })),
    })),
  };
}

beforeEach(() => {
  dbMocks.listReadyJournalsMock.mockResolvedValue([]);
});

function mockDeleteMediaLibraryAssetEntries() {
  dbMocks.getMock
    .mockResolvedValueOnce(
      createMediaEntry({ source: { kind: 'recording', recordingId: 'rec-1' } })
    )
    .mockResolvedValueOnce(
      createMediaEntry({
        source: {
          kind: 'project-export',
          exportId: 'exp-1',
          projectId: 'project-1',
        },
      })
    )
    .mockResolvedValueOnce(
      createMediaEntry({ source: { kind: 'project-asset', projectAssetId: 'asset-1' } })
    )
    .mockResolvedValueOnce(
      createMediaEntry({
        blob: new Blob(['png'], { type: 'image/png' }),
        id: 'screenshot',
        kind: 'screenshot',
        mimeType: 'image/png',
        source: { kind: 'screenshot' },
      })
    )
    .mockResolvedValueOnce(undefined);
}

function expectDeleteMediaLibraryAssetCleanup() {
  expect(dbMocks.deleteCascadeMock).toHaveBeenCalledWith('recording', []);
  expect(dbMocks.deleteProjectExportMock).toHaveBeenCalledWith('exp-1');
  expect(dbMocks.deleteCascadeMock).toHaveBeenCalledWith('asset', []);
  ['export', 'screenshot'].forEach((assetId) =>
    expect(dbMocks.objectStoreDeleteMock).toHaveBeenCalledWith(assetId)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.txDoneMock.mockResolvedValue(undefined);
  dbMocks.objectStoreGetMock.mockResolvedValue(undefined);
  dbMocks.initDBMock.mockResolvedValue(createDb());
});

function registerUpdateMediaLibraryEntryTests() {
  it('updates media metadata while preserving existing tags and refresh timestamps', async () => {
    const existingEntry = createMediaEntry({
      tags: ['old'],
      sourceTitle: 'Before',
      lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 100 },
    });
    dbMocks.getMock.mockResolvedValue(existingEntry);
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(999);

    try {
      await updateMediaLibraryEntry('asset-1', {
        filename: 'renamed.png',
        sourceTitle: 'After',
      });
    } finally {
      dateNow.mockRestore();
    }

    expect(dbMocks.putMock).toHaveBeenCalledWith(
      'media_library',
      expect.objectContaining({
        filename: 'renamed.png',
        sourceTitle: 'After',
        tags: ['old'],
        updatedAt: 999,
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 100 },
      })
    );
  });
}

function registerDeleteMediaLibraryAssetTests() {
  it('deletes media assets and routes cleanup to the owning store', async () => {
    mockDeleteMediaLibraryAssetEntries();

    await deleteMediaLibraryAsset('recording');
    await deleteMediaLibraryAsset('export');
    await deleteMediaLibraryAsset('asset');
    await deleteMediaLibraryAsset('screenshot');
    await deleteMediaLibraryAsset('missing');

    expectDeleteMediaLibraryAssetCleanup();
  });
}

function registerDeleteMediaLibraryAssetFailureTests() {
  it('refuses to delete a source still referenced by a project', async () => {
    dbMocks.getMock.mockResolvedValue(createMediaEntry());
    dbMocks.listMediaAssetProjectUsageMock.mockResolvedValueOnce([
      { id: 'project-1', kind: 'video', name: 'Video', primary: false },
    ]);

    await expect(deleteMediaLibraryAsset('recording')).rejects.toMatchObject({
      assetId: 'recording',
      stage: 'linked-source-cleanup',
    });
    expect(dbMocks.deleteRecordingMock).not.toHaveBeenCalled();
    expect(dbMocks.objectStoreDeleteMock).not.toHaveBeenCalled();
  });

  it('preserves media rows when source cleanup fails', async () => {
    const sourceError = new Error('recording delete failed');
    dbMocks.getMock.mockResolvedValue(
      createMediaEntry({ source: { kind: 'recording', recordingId: 'rec-1' } })
    );
    dbMocks.deleteCascadeMock.mockRejectedValueOnce(sourceError);

    try {
      await deleteMediaLibraryAsset('recording');
      throw new Error('deleteMediaLibraryAsset should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(MediaLibraryDeleteError);
      expect(error).toMatchObject({
        assetId: 'recording',
        cause: sourceError,
        stage: 'linked-source-cleanup',
      });
    }

    expect(dbMocks.objectStoreDeleteMock).not.toHaveBeenCalled();
  });

  it('does not run a second media-row deletion after atomic cascade failure', async () => {
    const transactionError = new Error('transaction failed');
    dbMocks.getMock.mockResolvedValue(
      createMediaEntry({ source: { kind: 'project-asset', projectAssetId: 'asset-1' } })
    );
    dbMocks.deleteCascadeMock.mockRejectedValueOnce(transactionError);

    try {
      await deleteMediaLibraryAsset('asset');
      throw new Error('deleteMediaLibraryAsset should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(MediaLibraryDeleteError);
      expect(error).toMatchObject({
        assetId: 'asset',
        cause: transactionError,
        stage: 'linked-source-cleanup',
      });
    }

    expect(dbMocks.objectStoreDeleteMock).not.toHaveBeenCalled();
  });
}

describe('media-library-db.library mutations', () => {
  registerUpdateMediaLibraryEntryTests();
  registerDeleteMediaLibraryAssetTests();
  registerDeleteMediaLibraryAssetFailureTests();
});
