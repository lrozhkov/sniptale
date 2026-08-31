import { beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import type { SaveWebSnapshotMediaAssetInput } from '../media-library/contracts';
import type { StoredWebSnapshotRecord } from './contracts';

const mediaMocks = vi.hoisted(() => ({
  createImageThumbnailBlobMock: vi.fn(),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: vi.fn(),
  dataUrlToBlob: vi.fn(),
}));

vi.mock('../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: mediaMocks.createImageThumbnailBlobMock,
}));

vi.mock('../../../platform/media-utils/video-thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/video-thumbnails')>()),
  createVideoThumbnailBlob: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-load')>()),
  loadImageFromBlob: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mediaMocks.createImageThumbnailBlobMock.mockResolvedValue(
    new Blob(['thumbnail'], { type: 'image/webp' })
  );
});

it('creates Web Snapshot thumbnails from the top of the retained page raster', async () => {
  const { createWebSnapshotThumbnailEntry } = await import('./media-entry');
  const screenshotBlob = new Blob(['png'], { type: 'image/png' });

  await expect(
    createWebSnapshotThumbnailEntry({
      assetId: 'snapshot-1',
      createdAt: 100,
      screenshotBlob,
      updatedAt: 200,
    })
  ).resolves.toMatchObject({ assetId: 'snapshot-1', height: 180, width: 320 });
  expect(mediaMocks.createImageThumbnailBlobMock).toHaveBeenCalledWith(screenshotBlob, 320, 180, {
    verticalAnchor: 'top',
  });
});

function createManifest(): WebSnapshotManifest {
  return createPagePackageManifestFixture({
    source: {
      faviconUrl: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
      title: 'Sensitive page',
      url: 'https://user:pass@example.com/invite/abc?token=secret#access_token=abc',
    },
  });
}

it('sanitizes web snapshot provenance before creating the media entry', async () => {
  const { createWebSnapshotMediaEntry } = await import('./media-entry');
  const manifest = createManifest();
  const input: SaveWebSnapshotMediaAssetInput = {
    filename: 'snapshot.zip',
    manifest,
    packageBlob: new Blob(['zip'], { type: 'application/zip' }),
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
  };
  const snapshot: StoredWebSnapshotRecord = {
    createdAt: 100,
    id: 'snapshot-1',
    manifest,
    packageAssetId: 'package-asset',
    screenshotAssetId: 'screenshot-asset',
    screenshotMimeType: 'image/png',
    screenshotSize: input.screenshotBlob.size,
    size: input.packageBlob.size,
    updatedAt: 100,
  };

  await expect(
    createWebSnapshotMediaEntry({
      assetId: 'asset-1',
      input,
      now: 200,
      screenshotDimensions: { height: 720, width: 1280 },
      snapshot,
    })
  ).resolves.toEqual(
    expect.objectContaining({
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceTitle: 'Sensitive page',
      sourceUrl: 'https://example.com/',
    })
  );
});
