import { WebSnapshotCaptureMode } from '@sniptale/runtime-contracts/web-snapshot';
import type { StoredWebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';

export function createCleanupWebSnapshotRecord(id: string): StoredWebSnapshotRecord {
  const packageSize = 8;
  return {
    createdAt: 1,
    id,
    manifest: {
      captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
      capturedAt: '2026-01-01T00:00:00.000Z',
      id,
      paths: {
        computedStyles: 'computed-styles.json',
        domSnapshot: 'dom.json',
        errors: 'errors.json',
        manifest: 'manifest.json',
        screenshot: 'screenshot.png',
        stylesheets: 'stylesheets.json',
        snapshotHtml: 'snapshot.html',
        virtualDomSnapshot: 'virtual-dom.json',
      },
      schemaVersion: 1,
      source: { faviconUrl: null, title: null, url: null },
      stats: {
        assetCount: 0,
        failedAssetCount: 0,
        packageSize,
        warningCount: 0,
      },
      warnings: [],
    },
    packageAssetId: `${id}-package`,
    screenshotAssetId: `${id}-screenshot`,
    screenshotMimeType: 'image/png',
    screenshotSize: 3,
    size: packageSize,
    updatedAt: 1,
  };
}
