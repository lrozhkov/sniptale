import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../test-support/items';

const mocks = vi.hoisted(() => ({
  createImageThumbnailBlob: vi.fn(),
  getMediaAssetBlob: vi.fn(),
  getMediaThumbnail: vi.fn(),
  getWebSnapshotScreenshotFile: vi.fn(),
  saveMediaThumbnail: vi.fn(),
  validateWebSnapshotScreenshotBlob: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaAssetBlob: mocks.getMediaAssetBlob,
    getMediaThumbnail: mocks.getMediaThumbnail,
    saveMediaThumbnail: mocks.saveMediaThumbnail,
  })
);

vi.mock('../../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/web-snapshots')>()),
  getWebSnapshotScreenshotFile: mocks.getWebSnapshotScreenshotFile,
}));

vi.mock('../../../platform/media-utils/image-thumbnail', () => ({
  createImageThumbnailBlob: mocks.createImageThumbnailBlob,
}));

vi.mock('../../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/web-snapshot/screenshot-validation')
  >()),
  validateWebSnapshotScreenshotBlob: mocks.validateWebSnapshotScreenshotBlob,
}));

vi.mock('../../../platform/media-utils/video-thumbnails', () => ({
  createVideoThumbnailBlob: vi.fn(),
  VIDEO_THUMBNAIL_GENERATOR_VERSION: 1,
}));

import { ensureLegacyGalleryThumbnail } from './legacy-thumbnails';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMediaThumbnail.mockResolvedValue(undefined);
  mocks.getWebSnapshotScreenshotFile.mockResolvedValue(
    new File(['screenshot'], 'snapshot.png', { type: 'image/png' })
  );
  mocks.createImageThumbnailBlob.mockResolvedValue(new Blob(['thumbnail'], { type: 'image/webp' }));
  mocks.validateWebSnapshotScreenshotBlob.mockResolvedValue({ height: 720, width: 1280 });
  mocks.saveMediaThumbnail.mockResolvedValue(undefined);
});

it('rebuilds a missing web snapshot thumbnail from its retained screenshot, not its ZIP', async () => {
  const item = createMediaItem({
    entityId: 'snapshot-1',
    filename: 'snapshot.sniptale-page-package.zip',
    id: 'snapshot-1',
    kind: 'web-archive',
    mimeType: 'application/x-sniptale-page-package+zip',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
  });

  await expect(ensureLegacyGalleryThumbnail(item)).resolves.toEqual(
    expect.objectContaining({ assetId: 'snapshot-1', height: 180, width: 320 })
  );
  expect(mocks.getWebSnapshotScreenshotFile).toHaveBeenCalledWith('snapshot-1');
  expect(mocks.getMediaAssetBlob).not.toHaveBeenCalled();
  expect(mocks.validateWebSnapshotScreenshotBlob).toHaveBeenCalledTimes(1);
  expect(mocks.createImageThumbnailBlob).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'snapshot.png', type: 'image/png' }),
    320,
    180,
    { verticalAnchor: 'top' }
  );
  expect(mocks.saveMediaThumbnail).toHaveBeenCalledWith(
    expect.objectContaining({ assetId: 'snapshot-1' })
  );
});

it.each([
  'Web snapshot screenshot is too large.',
  'Web snapshot screenshot is invalid.',
  'Web snapshot screenshot dimensions exceed safe limits.',
])('keeps rejected web snapshot screenshot recovery read-only: %s', async (message) => {
  mocks.validateWebSnapshotScreenshotBlob.mockRejectedValue(new Error(message));
  const item = createMediaItem({
    id: 'snapshot-rejected',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-rejected' },
  });

  await expect(ensureLegacyGalleryThumbnail(item)).resolves.toBeUndefined();
  expect(mocks.createImageThumbnailBlob).not.toHaveBeenCalled();
  expect(mocks.saveMediaThumbnail).not.toHaveBeenCalled();
});

it('keeps missing web snapshot screenshot recovery read-only', async () => {
  mocks.getWebSnapshotScreenshotFile.mockResolvedValue(undefined);
  const item = createMediaItem({
    id: 'snapshot-missing',
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-missing' },
  });

  await expect(ensureLegacyGalleryThumbnail(item)).resolves.toBeUndefined();
  expect(mocks.createImageThumbnailBlob).not.toHaveBeenCalled();
  expect(mocks.saveMediaThumbnail).not.toHaveBeenCalled();
});
