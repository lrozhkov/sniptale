import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import type { MediaAssetKind } from '../../../features/media-hub/media-types';
import type { LibraryLifecycle, LibraryStorageClass } from '../library-lifecycle/contracts';
import type { RecordingGroupMember } from '../../../features/media-hub/recording-groups';

export type { MediaAssetKind } from '../../../features/media-hub/media-types';

export type ImageContentState = 'edited' | 'original';

export type MediaAssetSource =
  | { kind: 'screenshot' }
  | { kind: 'recording'; recordingId: string }
  | {
      kind: 'project-export';
      exportId: string;
      projectId: string;
    }
  | { kind: 'project-asset'; projectAssetId: string }
  | { kind: 'web-snapshot'; snapshotId: string };

export interface MediaLibraryEntry {
  id: string;
  kind: MediaAssetKind;
  source: MediaAssetSource;
  filename: string;
  originalFilename: string;
  createdAt: number;
  updatedAt: number;
  size: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceFavicon: string | null;
  tags: string[];
  lifecycle?: LibraryLifecycle;
  recordingGroup?: RecordingGroupMember;
  /** Monotonic editable-workspace revision. Original-only media remains at revision zero. */
  /** Missing only on pre-v24 persisted rows; readers normalize it to revision 0. */
  workspaceRevision?: number;
  /** Whether the current editable image content differs from its immutable source blob. */
  imageContentState?: ImageContentState;
  blob?: Blob;
}

export interface MediaThumbnailEntry {
  assetId: string;
  blob: Blob;
  createdAt: number;
  /** Derived renderer revision. Missing on legacy thumbnails. */
  generatorVersion?: number;
  updatedAt: number;
  width: number;
  height: number;
}

export interface MediaLibraryItem extends Omit<MediaLibraryEntry, 'blob'> {
  hasThumbnail: boolean;
}

export interface SaveScreenshotMediaAssetInput {
  id?: string;
  blob: Blob;
  filename: string;
  createdAt?: number;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceFavicon?: string | null;
  tags?: string[];
  storageClass?: LibraryStorageClass;
  kind?: 'image' | 'screenshot';
}

export interface SaveWebSnapshotMediaAssetInput {
  id?: string;
  createdAt?: number;
  filename: string;
  manifest: WebSnapshotManifest;
  packageBlob: Blob;
  screenshotBlob: Blob;
  sourceFavicon?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  tags?: string[];
}
