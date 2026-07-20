import type {
  WebSnapshotManifest,
  WebSnapshotViewport,
} from '@sniptale/runtime-contracts/web-snapshot';

export interface WebSnapshotAssetEntry {
  blob: Blob;
  localPath: string;
  originalUrl: string;
}

export interface WebSnapshotPageSource {
  title: string | null;
  url: string;
  viewport?: WebSnapshotViewport;
}

export interface WebSnapshotWarningStats {
  failedAssetCount: number;
  networkWarningCount: number;
  sanitizerWarningCount: number;
  warningCount: number;
}

export interface WebSnapshotBuildResult {
  manifest: WebSnapshotManifest;
  packageBlob: Blob;
  screenshotBlob: Blob;
  screenshotMimeType: string;
  snapshotSessionId: string;
  warnings: string[];
}
