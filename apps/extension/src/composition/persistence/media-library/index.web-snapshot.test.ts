import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createWebSnapshotManifest,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../../features/web-snapshot/manifest';
import type { MediaLibraryEntry, MediaThumbnailEntry } from './contracts';

const mocks = vi.hoisted(() => ({
  deleteProjectAsset: vi.fn(),
  deleteProjectExport: vi.fn(),
  deleteRecording: vi.fn(),
  deleteWebSnapshotMediaAsset: vi.fn(),
  get: vi.fn(),
  getWebSnapshotRecord: vi.fn(),
  initDB: vi.fn(),
  put: vi.fn(),
  rootDelete: vi.fn(),
  txDelete: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
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
  getWebSnapshotRecord: mocks.getWebSnapshotRecord,
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
      objectStore: () => ({ delete: mocks.txDelete }),
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
  const packageBlob = await createPackageBlob();
  const entry = createMediaEntry({
    id: 'asset-web',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
  });
  mocks.get.mockResolvedValue(entry);
  mocks.getWebSnapshotRecord.mockResolvedValue({ packageBlob });

  await expect(getMediaAssetBlob('asset-web')).resolves.toBeInstanceOf(Blob);
  await deleteMediaLibraryAsset('asset-web');

  expect(mocks.getWebSnapshotRecord).toHaveBeenCalledWith('snapshot-1');
  expect(mocks.deleteWebSnapshotMediaAsset).toHaveBeenCalledWith({
    assetId: 'asset-web',
    snapshotId: 'snapshot-1',
  });
  expect(mocks.txDelete).not.toHaveBeenCalledWith('asset-web');
});

async function createPackageBlob(): Promise<Blob> {
  const manifest = createWebSnapshotManifest({
    id: 'snapshot-1',
    source: { faviconUrl: null, title: 'Snapshot', url: 'https://example.com/' },
  });
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<main></main>');
  return zip.generateAsync({ type: 'blob' });
}

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
          recordingId: 'recording-2',
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
  expect(deleteRecording).toHaveBeenCalledWith('recording-2');
  expect(deleteProjectAsset).toHaveBeenCalledWith('project-asset-1');
  expect(mocks.txDelete).toHaveBeenCalledWith('asset-recording');
  expect(mocks.txDelete).toHaveBeenCalledWith('asset-export');
  expect(mocks.txDelete).toHaveBeenCalledWith('asset-project');
});
