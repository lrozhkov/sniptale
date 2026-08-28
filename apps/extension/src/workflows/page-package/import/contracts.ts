import type { PagePackageManifest } from '@sniptale/runtime-contracts/page-package';

export interface WebSnapshotImportInspection {
  archiveBytes: number;
  capturedAt: string;
  manifest: PagePackageManifest;
  resourceCount: number;
  sourceTitle: string | null;
  sourceUrl: string | null;
  warnings: readonly string[];
}

export interface ImportedWebSnapshotResult {
  assetId: string;
}
