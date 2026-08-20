import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
} from '../../../../composition/persistence/media-library/contracts';
import type {
  StoredProjectAssetEntry,
  StoredProjectExportEntry,
} from '../../../../composition/persistence/projects/contracts';
import type { StoredRecordingEntry } from '../../../../composition/persistence/recordings/contracts';
import type { PreparedAssetObject } from '../../../../composition/persistence/assets';
import { VideoExportFormat } from '../../../../features/video/project/types';

export function createRecordingStoreEntry(
  recordingId: string,
  entry: Omit<MediaLibraryEntry, 'blob'>,
  prepared: PreparedAssetObject
): StoredRecordingEntry {
  return {
    assetId: prepared.ref.assetId,
    createdAt: entry.createdAt,
    filename: entry.filename,
    id: recordingId,
    mimeType: entry.mimeType,
    size: prepared.ref.size,
    ...(entry.lifecycle ? { lifecycle: entry.lifecycle } : {}),
  };
}

export function createProjectExportStoreEntry(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  prepared: PreparedAssetObject
): StoredProjectExportEntry {
  if (entry.source.kind !== 'project-export') {
    throw new Error('Project export record builder requires a project-export media entry.');
  }

  return {
    assetId: prepared.ref.assetId,
    createdAt: entry.createdAt,
    duration: entry.duration ?? 0,
    filename: entry.filename,
    format: entry.mimeType.includes('mp4') ? VideoExportFormat.MP4 : VideoExportFormat.WEBM,
    fps: 30,
    height: entry.height ?? 0,
    id: entry.source.exportId,
    mimeType: entry.mimeType,
    projectId: entry.source.projectId,
    size: prepared.ref.size,
    width: entry.width ?? 0,
  };
}

export function createProjectAssetStoreEntry(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  prepared: PreparedAssetObject
): StoredProjectAssetEntry {
  if (entry.source.kind !== 'project-asset') {
    throw new Error('Project asset record builder requires a project-asset media entry.');
  }

  return {
    assetId: prepared.ref.assetId,
    createdAt: entry.createdAt,
    id: entry.source.projectAssetId,
    mimeType: entry.mimeType,
    size: prepared.ref.size,
  };
}

export function createThumbnailStoreEntry(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  thumbnail: Blob
): MediaThumbnailEntry {
  return {
    assetId: entry.id,
    blob: thumbnail,
    createdAt: entry.createdAt,
    height: 180,
    updatedAt: entry.updatedAt,
    width: 320,
  };
}
