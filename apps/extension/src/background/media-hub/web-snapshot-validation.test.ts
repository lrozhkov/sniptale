import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
  type WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';
import { validateWebSnapshotPackage } from './web-snapshot-validation';

const validateRetainedScreenshotMock = vi.hoisted(() => vi.fn());

vi.mock('../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/web-snapshot/screenshot-validation')>()),
  validateRetainedWebSnapshotScreenshot: validateRetainedScreenshotMock,
}));

beforeEach(() => {
  validateRetainedScreenshotMock.mockReset();
  validateRetainedScreenshotMock.mockResolvedValue({ height: 720, width: 1280 });
});

function createManifest(overrides: Partial<WebSnapshotManifest> = {}): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Example Page', url: 'https://example.com/page' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 10 },
    warnings: [],
    ...overrides,
  };
}

function createPayload(manifest = createManifest()): WebSnapshotSaveToGalleryPayload {
  return {
    manifest,
    packageStagedBlobId: 'package-stage-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'screenshot-stage-1',
    snapshotSessionId: 'snapshot-session-1',
  };
}

async function createPackageBlob(manifestText: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, manifestText);
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<!doctype html><main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  return zip.generateAsync({ type: 'blob' });
}

it('rejects malformed package manifest JSON with a stable boundary error', async () => {
  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createPackageBlob('{'),
      payload: createPayload(),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('Web snapshot package manifest is invalid.');
});

it('rejects package manifest JSON that fails the web snapshot schema', async () => {
  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createPackageBlob('{"schemaVersion":1}'),
      payload: createPayload(),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('Web snapshot package manifest is invalid');
});

it('rejects package manifests that do not match the payload manifest identity', async () => {
  const packageManifest = createManifest({ id: 'snapshot-2' });

  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createPackageBlob(JSON.stringify(packageManifest)),
      payload: createPayload(),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow('Web snapshot package manifest does not match payload manifest');
});

it('accepts a retained screenshot that is byte-identical to the package screenshot', async () => {
  const manifest = createManifest();

  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createPackageBlob(JSON.stringify(manifest)),
      payload: createPayload(manifest),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).resolves.toBeUndefined();
});

it('rejects a retained screenshot that differs from the package screenshot', async () => {
  const manifest = createManifest();
  validateRetainedScreenshotMock.mockRejectedValue(
    new Error('Web snapshot retained screenshot does not match the package')
  );

  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createPackageBlob(JSON.stringify(manifest)),
      payload: createPayload(manifest),
      screenshotBlob: new Blob(['different'], { type: 'image/png' }),
    })
  ).rejects.toThrow('Web snapshot retained screenshot does not match the package');
});

it.each([
  'Web snapshot screenshot is invalid.',
  'Web snapshot screenshot dimensions exceed safe limits.',
])('rejects unsafe retained screenshots at background admission: %s', async (message) => {
  const manifest = createManifest();
  validateRetainedScreenshotMock.mockRejectedValue(new Error(message));

  await expect(
    validateWebSnapshotPackage({
      packageBlob: await createPackageBlob(JSON.stringify(manifest)),
      payload: createPayload(manifest),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow(message);
});
