import JSZip from 'jszip';
import { expect, it } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
  type WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';
import { validateWebSnapshotPackage } from './web-snapshot-validation';

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
