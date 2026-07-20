import { beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { SaveWebSnapshotMediaAssetInput } from '../media-library/contracts';
import type { WebSnapshotRecord } from './contracts';

const mediaMocks = vi.hoisted(() => ({
  measureImageBlobMock: vi.fn(),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: vi.fn(),
  dataUrlToBlob: vi.fn(),
}));

vi.mock('../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: vi.fn(),
}));

vi.mock('../../../platform/media-utils/video-thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/video-thumbnails')>()),
  createVideoThumbnailBlob: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-load')>()),
  loadImageFromBlob: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: mediaMocks.measureImageBlobMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mediaMocks.measureImageBlobMock.mockResolvedValue({ height: 720, width: 1280 });
});

function createManifest(): WebSnapshotManifest {
  return {
    capturedAt: '2026-06-10T00:00:00.000Z',
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    id: 'snapshot-1',
    paths: {
      computedStyles: 'computed.css',
      domSnapshot: 'dom.json',
      errors: 'errors.json',
      manifest: 'manifest.json',
      screenshot: 'screenshot.png',
      snapshotHtml: 'index.html',
      stylesheets: 'styles.css',
      virtualDomSnapshot: 'virtual.json',
    },
    schemaVersion: 1,
    source: {
      faviconUrl: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
      title: 'Sensitive page',
      url: 'https://user:pass@example.com/invite/abc?token=secret#access_token=abc',
    },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 1 },
    warnings: [],
  };
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
  const snapshot: WebSnapshotRecord = {
    createdAt: 100,
    id: 'snapshot-1',
    manifest,
    packageBlob: input.packageBlob,
    size: input.packageBlob.size,
    updatedAt: 100,
  };

  await expect(
    createWebSnapshotMediaEntry({ assetId: 'asset-1', input, now: 200, snapshot })
  ).resolves.toEqual(
    expect.objectContaining({
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceTitle: 'Sensitive page',
      sourceUrl: 'https://example.com/',
    })
  );
});
