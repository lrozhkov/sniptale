import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from './contracts';

const dbMocks = vi.hoisted(() => ({
  deleteProjectAssetMock: vi.fn(),
  deleteProjectExportMock: vi.fn(),
  deleteRecordingMock: vi.fn(),
  getMock: vi.fn(),
  initDBMock: vi.fn(),
  objectStoreDeleteMock: vi.fn(),
  putMock: vi.fn(),
  txDoneMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
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
    ...(overrides.blob === undefined ? {} : { blob: overrides.blob }),
  };
}

function createDb() {
  return {
    get: dbMocks.getMock,
    put: dbMocks.putMock,
    transaction: vi.fn(() => ({
      done: dbMocks.txDoneMock(),
      objectStore: vi.fn(() => ({ delete: dbMocks.objectStoreDeleteMock })),
    })),
  };
}

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
          recordingId: 'rec-2',
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
  expect(dbMocks.deleteRecordingMock).toHaveBeenCalledWith('rec-1');
  expect(dbMocks.deleteProjectExportMock).toHaveBeenCalledWith('exp-1');
  expect(dbMocks.deleteRecordingMock).toHaveBeenCalledWith('rec-2');
  expect(dbMocks.deleteProjectAssetMock).toHaveBeenCalledWith('asset-1');
  ['recording', 'export', 'asset', 'screenshot'].forEach((assetId) =>
    expect(dbMocks.objectStoreDeleteMock).toHaveBeenCalledWith(assetId)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.txDoneMock.mockResolvedValue(undefined);
  dbMocks.initDBMock.mockResolvedValue(createDb());
});

function registerUpdateMediaLibraryEntryTests() {
  it('updates media metadata while preserving existing tags and refresh timestamps', async () => {
    const existingEntry = createMediaEntry({ tags: ['old'], sourceTitle: 'Before' });
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
  it('preserves media rows when source cleanup fails', async () => {
    const sourceError = new Error('recording delete failed');
    dbMocks.getMock.mockResolvedValue(
      createMediaEntry({ source: { kind: 'recording', recordingId: 'rec-1' } })
    );
    dbMocks.deleteRecordingMock.mockRejectedValue(sourceError);

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

  it('surfaces explicit failure when media rows fail after source cleanup', async () => {
    const transactionError = new Error('transaction failed');
    dbMocks.getMock.mockResolvedValue(
      createMediaEntry({ source: { kind: 'project-asset', projectAssetId: 'asset-1' } })
    );
    dbMocks.txDoneMock.mockReturnValueOnce(Promise.reject(transactionError));

    try {
      await deleteMediaLibraryAsset('asset');
      throw new Error('deleteMediaLibraryAsset should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(MediaLibraryDeleteError);
      expect(error).toMatchObject({
        assetId: 'asset',
        cause: transactionError,
        stage: 'media-library-transaction',
      });
    }

    expect(dbMocks.deleteProjectAssetMock).toHaveBeenCalledWith('asset-1');
  });
}

describe('media-library-db.library mutations', () => {
  registerUpdateMediaLibraryEntryTests();
  registerDeleteMediaLibraryAssetTests();
  registerDeleteMediaLibraryAssetFailureTests();
});
