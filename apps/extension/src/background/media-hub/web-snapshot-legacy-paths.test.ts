import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
  type WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';
import { saveWebSnapshotToMediaHub } from './web-snapshot';

const mocks = vi.hoisted(() => ({
  ensureHeadroom: vi.fn(),
  saveWebSnapshot: vi.fn(),
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  saveWebSnapshotMediaAssetSafely: mocks.saveWebSnapshot,
}));

vi.mock('../../features/media-hub/storage-capacity', () => ({
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
    source: { faviconUrl: null, title: 'Legacy Snapshot', url: 'https://example.com/page' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 10 },
    warnings: [],
  };
}

async function createPackageBase64(manifest: WebSnapshotManifest): Promise<string> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<!doctype html><main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.computedStyles, '{}');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.domSnapshot, '<main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.errors, '');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.stylesheets, '[]');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.virtualDomSnapshot, '{}');
  zip.file('logs/css/stylesheets/document-stylesheet-01.css', 'body { color: red; }');

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer.toString('base64');
}

async function createPayload() {
  const manifest = createManifest();
  const packageBase64 = await createPackageBase64(manifest);
  const screenshotBase64 = Buffer.from('png').toString('base64');
  return {
    packageBlob: new Blob([Buffer.from(packageBase64, 'base64')], {
      type: 'application/x-sniptale-web-snapshot+zip',
    }),
    payload: {
      manifest,
      packageStagedBlobId: 'package-stage-1',
      screenshotMimeType: 'image/png',
      screenshotStagedBlobId: 'screenshot-stage-1',
      snapshotSessionId: 'snapshot-session-1',
    } satisfies WebSnapshotSaveToGalleryPayload,
    screenshotBlob: new Blob([Buffer.from(screenshotBase64, 'base64')], { type: 'image/png' }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.ensureHeadroom.mockReset();
  mocks.saveWebSnapshot.mockReset();
  mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-legacy' });
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
});

it('accepts legacy stylesheet diagnostic entries while saving old web snapshot packages', async () => {
  await expect(saveWebSnapshotToMediaHub(await createPayload())).resolves.toBe('asset-legacy');

  expect(mocks.ensureHeadroom).toHaveBeenCalledOnce();
  expect(mocks.saveWebSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'Legacy_Snapshot.sniptale-web-snapshot.zip' })
  );
});
