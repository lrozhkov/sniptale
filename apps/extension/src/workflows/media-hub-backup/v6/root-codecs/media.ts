import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
} from '../../../../composition/persistence/media-library/contracts';
import type {
  StoredRecordingEntry,
  RecordingTelemetryEntry,
} from '../../../../composition/persistence/recordings/contracts';
import type { StoredWebSnapshotRecord } from '../../../../composition/persistence/web-snapshots/contracts';
import type { StoredImageWorkspaceEntry } from '../../../../composition/persistence/image-workspaces/contracts';
import type { AggregatePresentationEntry } from '../../../../composition/persistence/aggregate-presentations/contracts';
import type { PortableEditorDocumentV3 } from './editor-document';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../../../../composition/persistence/projects/read-guards';
import type {
  StoredProjectAssetEntry,
  StoredProjectExportEntry,
} from '../../../../composition/persistence/projects/contracts';
import {
  parsePortableVideoReview,
  type PortableVideoReview,
} from '../../../../composition/persistence/review-workspaces/backup-restore';
import { collectReviewAssetReferences } from '../../../../composition/persistence/review-workspaces/asset-refs';
import { parseRecordingEntry } from '../../../../composition/persistence/recordings/index.guards';
import { parseRecordingTelemetryEntry } from '../../../../composition/persistence/recordings/telemetry.guards';
import { createRecordingMediaId } from '../../../../features/media-hub/media-id';

interface PortableMediaReviewAsset {
  entry: Omit<StoredProjectAssetEntry, 'assetId'>;
  filename: string;
  objectId: string;
}

export interface PortableMediaThumbnail {
  objectId: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
}

export interface PortableAggregatePresentation {
  entry: Omit<AggregatePresentationEntry, 'previewBlob' | 'thumbnailBlob'>;
  previewObjectId?: string;
  thumbnailObjectId: string;
}

export interface PortableMediaMetadata {
  entry: Omit<MediaLibraryEntry, 'blob'>;
  originalObjectId: string;
  projectAsset?: Omit<StoredProjectAssetEntry, 'assetId'>;
  projectExport?: Omit<StoredProjectExportEntry, 'assetId'>;
  videoReview?: PortableVideoReview;
  reviewAssets?: PortableMediaReviewAsset[];
  thumbnail?: PortableMediaThumbnail;
  recording?: {
    entry: Omit<StoredRecordingEntry, 'assetId'>;
    telemetry?: RecordingTelemetryEntry;
  };
  webSnapshot?: {
    entry: Omit<StoredWebSnapshotRecord, 'packageAssetId' | 'screenshotAssetId'>;
    packageObjectId: string;
    screenshotObjectId: string;
  };
  workspace?: Omit<StoredImageWorkspaceEntry, 'document'> & {
    document: PortableEditorDocumentV3;
  };
  presentation?: PortableAggregatePresentation;
}

export function encodePortableThumbnail(
  entry: MediaThumbnailEntry,
  objectId: string
): PortableMediaThumbnail {
  const { blob: _blob, ...metadata } = entry;
  const { assetId: _assetId, ...portable } = metadata;
  return { ...portable, objectId };
}

export function encodePortablePresentation(args: {
  entry: AggregatePresentationEntry;
  previewObjectId?: string;
  thumbnailObjectId: string;
}): PortableAggregatePresentation {
  const { previewBlob: _previewBlob, thumbnailBlob: _thumbnailBlob, ...entry } = args.entry;
  return {
    entry,
    ...(args.previewObjectId ? { previewObjectId: args.previewObjectId } : {}),
    thumbnailObjectId: args.thumbnailObjectId,
  };
}

export function parsePortableMediaMetadata(value: unknown): PortableMediaMetadata {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('entry' in value) ||
    typeof value.entry !== 'object' ||
    value.entry === null ||
    !('originalObjectId' in value) ||
    typeof value.originalObjectId !== 'string' ||
    value.originalObjectId.length === 0 ||
    'assetId' in value.entry ||
    'blob' in value.entry ||
    !Array.isArray((value as { entry: { tags?: unknown } }).entry.tags)
  ) {
    throw new Error('Portable media root metadata is invalid.');
  }
  const metadata = { ...value } as Partial<PortableMediaMetadata>;
  if (
    [
      metadata.recording,
      metadata.webSnapshot,
      metadata.projectAsset,
      metadata.projectExport,
    ].filter((owner) => owner !== undefined).length > 1
  ) {
    throw new Error('Portable media root has multiple durable byte owners.');
  }
  if (
    metadata.thumbnail &&
    (typeof metadata.thumbnail.objectId !== 'string' || metadata.thumbnail.objectId.length === 0)
  ) {
    throw new Error('Portable media thumbnail metadata is invalid.');
  }
  if (
    metadata.webSnapshot &&
    (typeof metadata.webSnapshot.packageObjectId !== 'string' ||
      typeof metadata.webSnapshot.screenshotObjectId !== 'string' ||
      metadata.webSnapshot.packageObjectId === metadata.webSnapshot.screenshotObjectId)
  ) {
    throw new Error('Portable web snapshot metadata is invalid.');
  }
  const entry = metadata.entry as { kind?: unknown; source?: { kind?: unknown } };
  const hasWebSnapshotMarker =
    entry.kind === 'web-archive' ||
    entry.source?.kind === 'web-snapshot' ||
    metadata.webSnapshot !== undefined;
  if (
    hasWebSnapshotMarker &&
    !(
      entry.kind === 'web-archive' &&
      entry.source?.kind === 'web-snapshot' &&
      metadata.webSnapshot !== undefined
    )
  ) {
    throw new Error('Portable web snapshot role association is invalid.');
  }
  validateRecordingMedia(metadata);
  validateProjectMedia(metadata);
  if (metadata.videoReview !== undefined) {
    if (!metadata.entry || !metadata.entry.mimeType.startsWith('video/'))
      throw new Error('Video review requires video media.');
    metadata.videoReview = parsePortableVideoReview(metadata.videoReview, metadata.entry.id);
    if (metadata.videoReview.workspace.source.size !== metadata.entry.size)
      throw new Error('Video review source size is inconsistent.');
  }
  const reviewAssets = parseReviewAssets(metadata.reviewAssets, metadata.videoReview);
  if (reviewAssets) metadata.reviewAssets = reviewAssets;
  else delete metadata.reviewAssets;
  return metadata as PortableMediaMetadata;
}

function parseReviewAssets(
  value: unknown,
  review: PortableVideoReview | undefined
): PortableMediaReviewAsset[] | undefined {
  if (value === undefined && !review) return undefined;
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error('Portable media review assets are invalid.');
  }
  const assets = (value ?? []).map((raw) => {
    if (
      !isRecord(raw) ||
      !isRecord(raw['entry']) ||
      'assetId' in raw['entry'] ||
      typeof raw['filename'] !== 'string' ||
      typeof raw['objectId'] !== 'string' ||
      !raw['objectId']
    )
      throw new Error('Portable media review asset is invalid.');
    const entry = parseProjectAssetEntry({ ...raw['entry'], assetId: 'portable' });
    if (!entry) throw new Error('Portable media review asset is invalid.');
    const { assetId: _assetId, ...portable } = entry;
    return { entry: portable, filename: raw['filename'], objectId: raw['objectId'] };
  });
  const ids = assets.map((asset) => asset.entry.id);
  const objectIds = assets.map((asset) => asset.objectId);
  if (new Set(ids).size !== ids.length || new Set(objectIds).size !== objectIds.length) {
    throw new Error('Portable media review assets contain duplicate identities.');
  }
  const referenced = review
    ? [...collectReviewAssetReferences(review.workspace)].map((reference) =>
        reference.slice('project-asset:'.length)
      )
    : [];
  if (
    referenced.length !== ids.length ||
    referenced.some((id) => !ids.includes(id)) ||
    ids.some((id) => !referenced.includes(id))
  ) {
    throw new Error('Portable media review assets do not match the review references.');
  }
  return assets.length ? assets : undefined;
}

function validateRecordingMedia(metadata: Partial<PortableMediaMetadata>): void {
  const entry = metadata.entry;
  const source = entry?.source;
  if (metadata.recording === undefined && source?.kind !== 'recording') return;
  const recording = parsePortableRecording(metadata.recording);
  if (!recording || !entry || !hasMatchingRecordingIdentity(entry, recording.entry)) {
    throw new Error('Portable recording association is invalid.');
  }
  metadata.recording = recording;
}

function parsePortableRecording(value: unknown): PortableMediaMetadata['recording'] | null {
  if (!isRecord(value) || !isRecord(value['entry']) || 'assetId' in value['entry']) return null;
  const recording = parseRecordingEntry({ ...value['entry'], assetId: 'portable' });
  if (!recording) return null;
  const rawTelemetry = value['telemetry'];
  const telemetry =
    rawTelemetry === undefined ? undefined : parseRecordingTelemetryEntry(rawTelemetry);
  if (rawTelemetry !== undefined && (!telemetry || telemetry.recordingId !== recording.id)) {
    return null;
  }
  const { assetId: _localId, ...portable } = recording;
  return {
    entry: portable,
    ...(telemetry ? { telemetry } : {}),
  };
}

function hasMatchingRecordingIdentity(
  entry: PortableMediaMetadata['entry'],
  recording: NonNullable<PortableMediaMetadata['recording']>['entry']
): boolean {
  return (
    entry.source.kind === 'recording' &&
    entry.source.recordingId === recording.id &&
    entry.id === createRecordingMediaId(recording.id) &&
    entry.mimeType === recording.mimeType &&
    entry.size === recording.size
  );
}

function validateProjectMedia(metadata: Partial<PortableMediaMetadata>): void {
  const source = metadata.entry?.source;
  if (metadata.projectAsset !== undefined || source?.kind === 'project-asset') {
    const raw: unknown = metadata.projectAsset;
    const parsed =
      isRecord(raw) && !('assetId' in raw)
        ? parseProjectAssetEntry({ ...raw, assetId: 'portable' })
        : null;
    if (
      !parsed ||
      source?.kind !== 'project-asset' ||
      source.projectAssetId !== parsed.id ||
      metadata.entry?.id !== `project-asset:${parsed.id}` ||
      !parsed.mimeType.startsWith('video/') ||
      metadata.entry.mimeType !== parsed.mimeType
    ) {
      throw new Error('Portable project video asset association is invalid.');
    }
    const { assetId: _localId, ...portable } = parsed;
    metadata.projectAsset = portable;
  }
  if (metadata.projectExport !== undefined || source?.kind === 'project-export') {
    const raw: unknown = metadata.projectExport;
    const parsed =
      isRecord(raw) && !('assetId' in raw)
        ? parseProjectExportEntry({ ...raw, assetId: 'portable' })
        : null;
    if (
      !parsed ||
      source?.kind !== 'project-export' ||
      source.exportId !== parsed.id ||
      source.projectId !== parsed.projectId ||
      metadata.entry?.id !== `export:${parsed.id}` ||
      !(parsed.mimeType ?? 'video/webm').startsWith('video/') ||
      metadata.entry.mimeType !== (parsed.mimeType ?? 'video/webm')
    ) {
      throw new Error('Portable project video export association is invalid.');
    }
    const { assetId: _localId, ...portable } = parsed;
    metadata.projectExport = portable;
  }
}
