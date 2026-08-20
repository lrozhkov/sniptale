import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry, MediaThumbnailEntry } from './contracts';

const mocks = vi.hoisted(() => ({
  deleteProjectAsset: vi.fn(),
  deleteProjectExport: vi.fn(),
  deleteRecording: vi.fn(),
  deleteWebSnapshotMediaAsset: vi.fn(),
  get: vi.fn(),
  getWebSnapshotPackageFile: vi.fn(),
  initDB: vi.fn(),
  put: vi.fn(),
  rootDelete: vi.fn(),
  txDelete: vi.fn(),
  txGet: vi.fn(),
  txPut: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));
vi.mock('../projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects/index')>()),
  deleteProjectAsset: mocks.deleteProjectAsset,
  deleteProjectExport: mocks.deleteProjectExport,
  getProjectAsset: vi.fn(),
}));
vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recordings/index')>()),
  deleteRecording: mocks.deleteRecording,
  getRecording: vi.fn(),
}));
vi.mock('../web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../web-snapshots')>()),
  deleteWebSnapshotMediaAsset: mocks.deleteWebSnapshotMediaAsset,
  getWebSnapshotPackageFile: mocks.getWebSnapshotPackageFile,
}));
vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  listReadyJournals: vi.fn(async () => []),
}));

import { deleteProjectAsset, deleteProjectExport } from '../projects/index';
import { deleteRecording } from '../recordings/index';
import {
  deleteMediaLibraryAsset,
  deleteMediaThumbnail,
  getMediaAssetBlob,
  getMediaThumbnail,
  saveMediaThumbnail,
  updateMediaLibraryEntry,
} from './index.library.ts';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({
    get: mocks.get,
    put: mocks.put,
    delete: mocks.rootDelete,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: () => ({ delete: mocks.txDelete, get: mocks.txGet, put: mocks.txPut }),
    })),
  });
});

function createMediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    createdAt: 100,
    duration: null,
    filename: 'asset.webm',
    height: null,
    id: 'asset-1',
    kind: 'recording',
    mimeType: 'video/webm',
    originalFilename: 'asset.webm',
    size: 10,
    source: { kind: 'recording', recordingId: 'recording-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 100,
    width: null,
    ...overrides,
  };
}

it('resolves and deletes web snapshot media through the linked package owner', async () => {
  const packageFile = new File(['zip'], 'snapshot.zip', { type: 'application/zip' });
  const entry = createMediaEntry({
    id: 'asset-web',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
  });
  mocks.get.mockResolvedValue(entry);
  mocks.getWebSnapshotPackageFile.mockResolvedValue(packageFile);

  await expect(getMediaAssetBlob('asset-web')).resolves.toBeInstanceOf(Blob);
  await deleteMediaLibraryAsset('asset-web');

  expect(mocks.getWebSnapshotPackageFile).toHaveBeenCalledWith('snapshot-1');
  expect(mocks.deleteWebSnapshotMediaAsset).toHaveBeenCalledWith({
    assetId: 'asset-web',
    snapshotId: 'snapshot-1',
  });
  expect(mocks.txDelete).not.toHaveBeenCalledWith('asset-web');
});

it('updates metadata and handles thumbnail helpers through the media library stores', async () => {
  mocks.get.mockResolvedValueOnce(
    createMediaEntry({
      filename: 'old.png',
      id: 'asset-1',
      kind: 'screenshot',
      mimeType: 'image/png',
      originalFilename: 'old.png',
      source: { kind: 'screenshot' },
      tags: ['old'],
    })
  );
  const thumbnail: MediaThumbnailEntry = {
    assetId: 'asset-1',
    blob: new Blob(['png']),
    createdAt: 1,
    height: 90,
    updatedAt: 1,
    width: 120,
  };

  await updateMediaLibraryEntry('asset-1', { filename: 'new.png', tags: ['new'] });
  await saveMediaThumbnail(thumbnail);
  await deleteMediaThumbnail('asset-1');
  await getMediaThumbnail('asset-1');

  expect(mocks.put).toHaveBeenCalledWith(
    'media_library',
    expect.objectContaining({ filename: 'new.png', tags: ['new'] })
  );
  expect(mocks.put).toHaveBeenCalledWith('thumbnails', thumbnail);
  expect(mocks.rootDelete).toHaveBeenCalledWith('thumbnails', 'asset-1');
  expect(mocks.get).toHaveBeenLastCalledWith('thumbnails', 'asset-1');
});

it('deletes regular media assets after cleaning their source records', async () => {
  mocks.get
    .mockResolvedValueOnce(
      createMediaEntry({
        id: 'asset-recording',
        source: { kind: 'recording', recordingId: 'recording-1' },
      })
    )
    .mockResolvedValueOnce(
      createMediaEntry({
        id: 'asset-export',
        kind: 'export',
        source: {
          exportId: 'export-1',
          kind: 'project-export',
          projectId: 'project-1',
        },
      })
    )
    .mockResolvedValueOnce(
      createMediaEntry({
        id: 'asset-project',
        kind: 'image',
        mimeType: 'image/png',
        source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
      })
    )
    .mockResolvedValueOnce(undefined);

  await deleteMediaLibraryAsset('asset-recording');
  await deleteMediaLibraryAsset('asset-export');
  await deleteMediaLibraryAsset('asset-project');
  await deleteMediaLibraryAsset('missing');

  expect(deleteRecording).toHaveBeenCalledWith('recording-1');
  expect(deleteProjectExport).toHaveBeenCalledWith('export-1');
  expect(deleteRecording).toHaveBeenCalledOnce();
  expect(deleteProjectAsset).toHaveBeenCalledWith('project-asset-1');
  expect(mocks.txDelete).toHaveBeenCalledWith('asset-recording');
  expect(mocks.txDelete).toHaveBeenCalledWith('asset-export');
  expect(mocks.txDelete).toHaveBeenCalledWith('asset-project');
});
