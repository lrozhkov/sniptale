import { WebSnapshotCaptureMode } from '@sniptale/runtime-contracts/web-snapshot';
import type { WebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';

export function createCleanupWebSnapshotRecord(id: string): WebSnapshotRecord {
  const packageBlob = new Blob(['snapshot'], { type: 'application/zip' });
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
        packageSize: packageBlob.size,
        warningCount: 0,
      },
      warnings: [],
    },
    packageBlob,
    size: packageBlob.size,
    updatedAt: 1,
  };
}
