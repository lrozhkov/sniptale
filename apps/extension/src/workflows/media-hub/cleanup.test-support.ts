import type { StoredWebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';
import { createPagePackageManifestFixture } from '../../features/web-snapshot/manifest.test-support';

export function createCleanupWebSnapshotRecord(id: string): StoredWebSnapshotRecord {
  const packageSize = 8;
  return {
    createdAt: 1,
    id,
    manifest: createPagePackageManifestFixture({
      id,
      source: { faviconUrl: null, title: null, url: null },
    }),
    packageAssetId: `${id}-package`,
    screenshotAssetId: `${id}-screenshot`,
    screenshotMimeType: 'image/png',
    screenshotSize: 3,
    size: packageSize,
    updatedAt: 1,
  };
}
