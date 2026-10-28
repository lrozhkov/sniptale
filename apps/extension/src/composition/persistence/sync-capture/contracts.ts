import type { StoredRecordingEntry, RecordingTelemetryEntry } from '../recordings/contracts';
import type { CapturedVideoReviewRows } from './review-snapshot';
import type { StoredImageWorkspaceEntry } from '../image-workspaces/contracts';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import type { AssetRef } from '../assets/contracts';
import type { VideoWorkspaceSnapshot } from '../review-workspaces/contracts';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import type { MediaLibraryEntry } from '../media-library/contracts';
import type {
  StoredProjectAssetEntry,
  StoredProjectExportEntry,
  VideoProjectEntry,
} from '../projects/contracts';

export const SYNC_CAPTURE_PROFILE_KEY = 'profile';
export const MAX_CAPTURE_ROWS = 32;
export const MAX_CAPTURE_METADATA_BYTES = 1024 * 1024;

/** The experiment admits only an explicitly enabled, local capture profile. */
export interface SyncCaptureProfile {
  version: 1;
  kind: 'profile';
  key: 'profile';
  createdAt: number;
  enabled: boolean;
  spaceId: string;
  connectionGeneration: number;
}

export type CaptureRootKind = 'media' | 'video-project' | 'video-review';
export type CaptureOrigin = 'local-edit' | 'local-restore';

/** Native accepted rows remain distinct from the portable backup representation. */
export interface CapturedVideoProjectRows {
  project: VideoProjectEntry;
  assets: StoredProjectAssetEntry[];
  exports: StoredProjectExportEntry[];
  media: Omit<MediaLibraryEntry, 'blob'>[];
  refs: AssetRef[];
  /** Private-source review state is part of the retained project graph. */
  reviews?: VideoWorkspaceSnapshot[];
  thumbnails?: MediaThumbnailEntry[];
  presentation?: AggregatePresentationEntry | null;
  /** Missing on legacy records, which have no admitted dependency evidence. */
  mediaDependencies?: CapturedMediaDependency[];
}

/** One immutable native screenshot aggregate, including inline source and presentation bytes. */
export interface CapturedImageRows {
  media: MediaLibraryEntry;
  workspace: StoredImageWorkspaceEntry | null;
  presentation: AggregatePresentationEntry | null;
  refs: AssetRef[];
}

export type CapturedMediaRows =
  | {
      media: Omit<MediaLibraryEntry, 'blob'>;
      projectAsset: StoredProjectAssetEntry;
      ref: AssetRef;
    }
  | {
      media: Omit<MediaLibraryEntry, 'blob'>;
      recording: StoredRecordingEntry;
      ref: AssetRef;
      telemetry: RecordingTelemetryEntry | null;
    };

export interface CapturedMediaDependency {
  mediaId: string;
  generation: number;
  basis: string[];
}

/** A deleted native identity retains its generation and causal predecessor. */
export interface SyncCaptureRootState {
  version: 1;
  kind: 'root-state';
  key: string;
  createdAt: number;
  spaceId: string;
  rootKind: CaptureRootKind;
  rootId: string;
  rootKey: string;
  generation: number;
  basis: string[];
  /** Explicit logical graveyard; missing rows alone do not authorize restoration. */
  deleted?: true;
  /** Digest of the normalized native media snapshot, including its local immutable ref. */
  nativeDigest?: string;
  /** Last accepted local image revision survives deletion of its native rows. */
  nativeRevision?: number;
}

/** Stable enrollment, causal identity, fingerprint and display source survive payload replacement. */
export interface CaptureOperationHeader {
  version: 1;
  kind: 'sync-operation';
  profileCreatedAt: number;
  sourceSha256: string;
  source: {
    changeKind: 'media' | 'image' | 'video-project' | 'video-review' | 'tombstone';
    label: string;
  };
  key: string;
  createdAt: number;
  spaceId: string;
  connectionGeneration: number;
  rootKind: CaptureRootKind;
  rootId: string;
  rootKey: string;
  generation: number;
  operationId: string;
  basis: string[];
  origin: CaptureOrigin;
  publicationId: string | null;
}

/** Native source exists only until portable preparation is accepted. */
export interface CapturedChange extends CaptureOperationHeader {
  phase: 'native';
  change:
    | { kind: 'video-project'; rows: CapturedVideoProjectRows }
    | {
        kind: 'video-review';
        rows: CapturedVideoReviewRows;
        mediaDependencies: CapturedMediaDependency[];
      }
    | { kind: 'media'; rows: CapturedMediaRows }
    | { kind: 'image'; rows: CapturedImageRows }
    | { kind: 'tombstone' };
}

/** Immutable portable content and local file bindings. Physical keys belong to attempts. */
export interface PreparedCaptureOperation extends CaptureOperationHeader {
  phase: 'prepared';
  prepared: {
    recordText: string;
    recordSha256: string;
    objects: { objectId: string; ref: AssetRef; sha256: string; filename: string }[];
  };
}

/** Publication facts replace portable bytes while retaining explicit immutable local pins. */
export interface PublishedCaptureOperation extends CaptureOperationHeader {
  phase: 'published';
  publication: {
    kind: 'verified' | 'observed';
    acceptedAt: number;
    preparedSha256: string;
    attemptId: string;
    recordKey: string;
    recordSha256: string;
  };
  objects: {
    objectId: string;
    ref: AssetRef;
    sha256: string;
    filename: string;
    remoteKey: string;
    pinned: boolean;
  }[];
}

export type CaptureOperation =
  | CapturedChange
  | PreparedCaptureOperation
  | PublishedCaptureOperation;

/** The local receipt records one checked application and prevents an outgoing echo. */
export interface SyncCaptureAppliedOperation {
  version: 1;
  kind: 'applied-operation';
  key: string;
  createdAt: number;
  spaceId: string;
  rootKey: string;
  operationId: string;
  sourceDigest: string;
  generation: number;
}

export type SyncCaptureRecord =
  | SyncCaptureProfile
  | SyncCaptureRootState
  | CaptureOperation
  | SyncCaptureAppliedOperation;

/** Tuple encoding prevents delimiter collisions in local native-store keys. */
export function captureRootKey(spaceId: string, kind: CaptureRootKind, rootId: string): string {
  return JSON.stringify([spaceId, kind, rootId]);
}
