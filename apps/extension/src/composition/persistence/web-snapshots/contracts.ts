import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';

export interface WebSnapshotRecord {
  id: string;
  packageBlob: Blob;
  manifest: WebSnapshotManifest;
  createdAt: number;
  updatedAt: number;
  size: number;
}
