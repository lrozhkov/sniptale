import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../../features/web-snapshot/manifest';

const mediaMocks = vi.hoisted(() => ({
  blobToDataUrl: vi.fn(async () => 'data:image/png;base64,cG5n'),
  createImageThumbnailBlob: vi.fn(async (blob: Blob) => blob),
  createVideoThumbnailBlob: vi.fn(),
  dataUrlToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
  loadImageFromBlob: vi.fn(async () => ({ height: 200, width: 300 })),
  measureImageBlob: vi.fn(async () => ({ height: 200, width: 300 })),
}));

const stores = new Map<string, Map<string, unknown>>();
const txDone = Promise.resolve();

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  WEB_SNAPSHOTS_STORE: 'web_snapshots',
  initDB: vi.fn(async () => ({
    get: vi.fn((store: string, id: string) => stores.get(store)?.get(id)),
    transaction: vi.fn((storeNames: string[]) => ({
      done: txDone,
      objectStore: (storeName: string) => ({
        delete: (id: string) => stores.get(storeName)?.delete(id),
        put: (entry: { id?: string; assetId?: string }) => {
          const id = entry.id ?? entry.assetId ?? '';
          stores.get(storeName)?.set(id, entry);
        },
      }),
      storeNames,
    })),
  })),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: mediaMocks.blobToDataUrl,
  dataUrlToBlob: mediaMocks.dataUrlToBlob,
}));

vi.mock('../../../platform/media-utils/image-thumbnail', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/image-thumbnail')>()),
  createImageThumbnailBlob: mediaMocks.createImageThumbnailBlob,
}));

vi.mock('../../../platform/media-utils/video-thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/video-thumbnails')>()),
  createVideoThumbnailBlob: mediaMocks.createVideoThumbnailBlob,
}));

vi.mock('@sniptale/platform/browser/media/image-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-load')>()),
  loadImageFromBlob: mediaMocks.loadImageFromBlob,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: mediaMocks.measureImageBlob,
}));

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: {
      computedStyles: 'logs/css/computed-styles.json',
      domSnapshot: 'logs/dom.html',
      errors: 'logs/errors.log',
      manifest: 'manifest.json',
      screenshot: 'page-screenshot.png',
      snapshotHtml: 'snapshot/index.html',
      stylesheets: 'logs/css/stylesheets.json',
      virtualDomSnapshot: 'logs/virtual-dom.html',
    },
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Page', url: 'https://example.com' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 3 },
    warnings: [],
  };
}

beforeEach(() => {
  stores.clear();
  stores.set('web_snapshots', new Map());
  stores.set('media_library', new Map());
  stores.set('thumbnails', new Map());
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'asset-1' });
  mediaMocks.blobToDataUrl.mockResolvedValue('data:image/png;base64,cG5n');
  mediaMocks.createImageThumbnailBlob.mockImplementation(async (blob: Blob) => blob);
  mediaMocks.dataUrlToBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  mediaMocks.loadImageFromBlob.mockResolvedValue({ height: 200, width: 300 });
  mediaMocks.measureImageBlob.mockResolvedValue({ height: 200, width: 300 });
});

it('saves web snapshot records with linked media and thumbnail entries', async () => {
  const { getWebSnapshotRecord, saveWebSnapshotMediaAsset } = await import('./records');
  const manifest = createManifest();
  const packageBlob = await createPackageBlob(manifest);
  const result = await saveWebSnapshotMediaAsset({
    filename: 'snapshot.zip',
    manifest,
    packageBlob,
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
  });

  expect(result.assetId).toBe('asset-1');
  await expect(getWebSnapshotRecord('asset-1')).resolves.toEqual(result.snapshot);
  expect(stores.get('media_library')?.get('asset-1')).toMatchObject({
    kind: 'web-archive',
    source: { kind: 'web-snapshot', snapshotId: 'asset-1' },
  });
  expect(stores.get('thumbnails')?.has('asset-1')).toBe(true);
});

async function createPackageBlob(manifest: WebSnapshotManifest): Promise<Blob> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<main></main>');
  return zip.generateAsync({ type: 'blob' });
}

it('rejects malformed persisted web snapshot records at the read boundary', async () => {
  const { getWebSnapshotRecord } = await import('./records');
  stores.get('web_snapshots')?.set('asset-1', {
    id: 'asset-1',
    packageBlob: 'not-a-blob',
    manifest: createManifest(),
    createdAt: 1,
    updatedAt: 1,
    size: 3,
  });

  await expect(getWebSnapshotRecord('asset-1')).resolves.toBeUndefined();
});

it('preserves image decode stage before storage errors can mask the failure', async () => {
  const { saveWebSnapshotMediaAsset } = await import('./records');
  const manifest = createManifest();
  const packageBlob = await createPackageBlob(manifest);
  mediaMocks.createImageThumbnailBlob.mockRejectedValueOnce(
    new DOMException('The source image could not be decoded.', 'InvalidStateError')
  );

  await expect(
    saveWebSnapshotMediaAsset({
      filename: 'snapshot.zip',
      manifest,
      packageBlob,
      screenshotBlob: new Blob(['not-png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('create web snapshot thumbnail entry: The source image could not be decoded.');
});
