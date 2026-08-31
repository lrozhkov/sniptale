import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from './contracts';

const dbMocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  getWebSnapshotPackageFileMock: vi.fn(),
  initDBMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  initDB: dbMocks.initDBMock,
}));

vi.mock('../projects/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getProjectAsset: vi.fn(),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: vi.fn(),
}));

vi.mock('../web-snapshots', async (importOriginal) => ({
  ...(await importOriginal()),
  getWebSnapshotPackageFile: dbMocks.getWebSnapshotPackageFileMock,
}));

import { getMediaAssetBlob } from './index.library';

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getMock.mockResolvedValue(createWebSnapshotMediaEntry());
  dbMocks.initDBMock.mockResolvedValue({
    get: dbMocks.getMock,
  });
});

it('returns the already-sanitized OPFS package file through the snapshot owner', async () => {
  const packageFile = new File(['zip'], 'snapshot.zip', { type: 'application/zip' });
  dbMocks.getWebSnapshotPackageFileMock.mockResolvedValue(packageFile);
  const result = await getMediaAssetBlob('asset-1');

  expect(result).toBe(packageFile);
  expect(dbMocks.getWebSnapshotPackageFileMock).toHaveBeenCalledWith('snapshot-1');
});

function createWebSnapshotMediaEntry(): MediaLibraryEntry {
  return {
    createdAt: 10,
    duration: null,
    filename: 'snapshot.zip',
    height: null,
    id: 'asset-1',
    kind: 'web-archive',
    mimeType: 'application/x-sniptale-page-package+zip',
    originalFilename: 'snapshot.zip',
    size: 10,
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceFavicon: null,
    sourceTitle: 'Snapshot',
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: null,
  };
}
