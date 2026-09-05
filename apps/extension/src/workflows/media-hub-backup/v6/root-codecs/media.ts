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
  validateProjectMedia(metadata);
  if (metadata.videoReview !== undefined) {
    if (!metadata.entry || !metadata.entry.mimeType.startsWith('video/'))
      throw new Error('Video review requires video media.');
    metadata.videoReview = parsePortableVideoReview(metadata.videoReview, metadata.entry.id);
    if (metadata.videoReview.workspace.source.size !== metadata.entry.size)
      throw new Error('Video review source size is inconsistent.');
  }
  return metadata as PortableMediaMetadata;
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
