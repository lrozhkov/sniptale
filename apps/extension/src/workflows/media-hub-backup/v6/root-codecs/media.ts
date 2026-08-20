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
  const metadata = value as Partial<PortableMediaMetadata>;
  if (metadata.recording && metadata.webSnapshot) {
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
  return metadata as PortableMediaMetadata;
}
