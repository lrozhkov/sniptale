import type { PagePackageManifest, PagePackageViewport } from '../page-package';

/** Product-domain alias: every Web Snapshot is persisted as a Page Package. */
export type WebSnapshotManifest = PagePackageManifest;
export type WebSnapshotViewport = PagePackageViewport;

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
  final: boolean;
  mimeType: string;
  sequence: number;
  snapshotSessionId: string;
  stagedBlobId: string;
}
