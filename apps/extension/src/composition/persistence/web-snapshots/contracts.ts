import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';

export interface StoredWebSnapshotRecord {
  id: string;
  packageAssetId: string;
  screenshotAssetId: string;
  screenshotMimeType: string;
  screenshotSize: number;
  manifest: WebSnapshotManifest;
  createdAt: number;
  updatedAt: number;
  size: number;
}

export interface WebSnapshotRecord extends Omit<
  StoredWebSnapshotRecord,
  'packageAssetId' | 'screenshotAssetId' | 'screenshotMimeType' | 'screenshotSize'
> {
  packageFile: File;
}
