import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
  type WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../../features/web-snapshot/manifest';
import {
  resetWebSnapshotStagedBlobsForTests,
  stageWebSnapshotBlobChunk,
} from './web-snapshot/staged-blobs';
import { resolveWebSnapshotPayloadBlobs } from './web-snapshot/payload-blobs';
import { saveWebSnapshotToMediaHub } from '../../media-hub/web-snapshot';

const mocks = vi.hoisted(() => ({
  ensureHeadroom: vi.fn(),
  saveWebSnapshot: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveWebSnapshotMediaAssetSafely: mocks.saveWebSnapshot,
}));

vi.mock('../../../features/media-hub/storage-capacity', () => ({
  StorageEstimateInfo: undefined,
  StorageQuotaHeadroomError: class StorageQuotaHeadroomError extends Error {},
  StorageQuotaHeadroomFailurePayload: undefined,
  isStorageQuotaHeadroomError: vi.fn(),
  StoragePressureLevel: undefined,
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroom,
  getStorageEstimateInfo: vi.fn(),
}));

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Example Page', url: 'https://example.com/page' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 10 },
    warnings: [],
  };
}

async function createPackageBase64(manifest: WebSnapshotManifest): Promise<string> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<!doctype html><main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer.toString('base64');
}

function createStagedPayload(manifest: WebSnapshotManifest): WebSnapshotSaveToGalleryPayload {
  return {
    manifest,
    packageStagedBlobId: 'package-stage-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'screenshot-stage-1',
    snapshotSessionId: 'snapshot-session-1',
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetWebSnapshotStagedBlobsForTests();
  mocks.ensureHeadroom.mockReset();
  mocks.saveWebSnapshot.mockReset();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
});

it('persists staged web snapshot blobs through the media hub safe API', async () => {
  const manifest = createManifest();
  const packageBase64 = await createPackageBase64(manifest);
  mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-staged' });
  stageWebSnapshotBlobChunk({
    base64: packageBase64,
    chunkIndex: 0,
    kind: 'package',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'package-stage-1',
    tabId: 42,
    totalBytes: Buffer.from(packageBase64, 'base64').byteLength,
    totalChunks: 1,
  });
  stageWebSnapshotBlobChunk({
    base64: Buffer.from('png').toString('base64'),
    chunkIndex: 0,
    kind: 'screenshot',
    snapshotSessionId: 'snapshot-session-1',
    stagedBlobId: 'screenshot-stage-1',
    tabId: 42,
    totalBytes: 3,
    totalChunks: 1,
  });

  const payload = createStagedPayload(manifest);
  await expect(
    saveWebSnapshotToMediaHub({
      ...resolveWebSnapshotPayloadBlobs(payload, 42),
      payload,
    })
  ).resolves.toBe('asset-staged');

  expect(mocks.ensureHeadroom).toHaveBeenCalledOnce();
  expect(mocks.saveWebSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'Example_Page.sniptale-web-snapshot.zip' })
  );
});

it('rejects missing staged blobs before saving media hub records', async () => {
  const manifest = createManifest();

  const payload = createStagedPayload(manifest);
  expect(() => resolveWebSnapshotPayloadBlobs(payload, 42)).toThrow(
    'Web snapshot staged payload is missing or incomplete'
  );

  expect(mocks.ensureHeadroom).not.toHaveBeenCalled();
  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
});
