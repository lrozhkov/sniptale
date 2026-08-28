import type { PagePackageViewport } from '@sniptale/runtime-contracts/page-package';
import type { ComposedPagePackage } from '../../../workflows/page-package/composer';

export interface WebSnapshotAssetEntry {
  blob: Blob;
  localPath: string;
  originalUrl: string;
}

export interface WebSnapshotPageSource {
  title: string | null;
  url: string;
  viewport?: PagePackageViewport;
}

export interface WebSnapshotWarningStats {
  failedAssetCount: number;
  networkWarningCount: number;
  sanitizerWarningCount: number;
  warningCount: number;
}

export interface WebSnapshotBuildResult {
  manifest: ComposedPagePackage<Blob>['manifest'];
  pagePackage: ComposedPagePackage<Blob>;
  screenshotBlob: Blob;
  screenshotMimeType: 'image/png';
  snapshotSessionId: string;
  warnings: string[];
}
