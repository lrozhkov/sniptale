export const WebSnapshotCaptureMode = {
  ReadOnlyNoScripts: 'readOnlyNoScripts',
} as const;

export type WebSnapshotCaptureMode =
  (typeof WebSnapshotCaptureMode)[keyof typeof WebSnapshotCaptureMode];

export interface WebSnapshotPackagePaths {
  computedStyles: string;
  domSnapshot: string;
  errors: string;
  manifest: string;
  screenshot: string;
  stylesheets: string;
  snapshotHtml: string;
  virtualDomSnapshot: string;
}

export interface WebSnapshotStats {
  assetCount: number;
  failedAssetCount: number;
  networkWarningCount?: number;
  packageSize: number;
  sanitizerWarningCount?: number;
  warningCount?: number;
}

export interface WebSnapshotSource {
  faviconUrl: string | null;
  title: string | null;
  url: string | null;
}

export interface WebSnapshotViewport {
  height: number;
  width: number;
}

export interface WebSnapshotAssetManifestEntry {
  mimeType: string;
  path: string;
  sha256: string;
  size: number;
}

export interface WebSnapshotManifest {
  assets?: WebSnapshotAssetManifestEntry[];
  captureMode: WebSnapshotCaptureMode;
  capturedAt: string;
  id: string;
  paths: WebSnapshotPackagePaths;
  schemaVersion: 1;
  source: WebSnapshotSource;
  stats: WebSnapshotStats;
  viewport?: WebSnapshotViewport;
  warnings: string[];
}

export interface WebSnapshotPackageEntry {
  binaryBase64?: string;
  mimeType?: string;
  path: string;
  textContent?: string;
}

export interface WebSnapshotPackage {
  entries: WebSnapshotPackageEntry[];
  manifest: WebSnapshotManifest;
}

export interface WebSnapshotProgress {
  message: string;
  phase: 'idle' | 'capturing' | 'collecting' | 'packaging' | 'saving' | 'done' | 'error';
  requestId: string;
}

export interface WebSnapshotSaveResult {
  assetId?: string;
  error?: string;
  manifest?: WebSnapshotManifest;
  success: boolean;
  warnings: string[];
}

export interface WebSnapshotSaveToGalleryPayload {
  manifest: WebSnapshotManifest;
  packageStagedBlobId: string;
  screenshotStagedBlobId: string;
  screenshotMimeType: string;
  snapshotSessionId: string;
}

export type WebSnapshotStagedBlobKind = 'package' | 'screenshot';

export interface WebSnapshotStageBlobChunkPayload {
  base64: string;
  blobKind: WebSnapshotStagedBlobKind;
  chunkIndex: number;
  snapshotSessionId: string;
  stagedBlobId: string;
  totalBytes: number;
  totalChunks: number;
}
