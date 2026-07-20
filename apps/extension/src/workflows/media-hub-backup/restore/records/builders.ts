import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
} from '../../../../composition/persistence/media-library/contracts';
import type {
  ProjectAssetEntry,
  ProjectExportEntry,
} from '../../../../composition/persistence/projects/contracts';
import type { RecordingEntry } from '../../../../composition/persistence/recordings/contracts';
import { VideoExportFormat } from '../../../../features/video/project/types';

export function createRecordingStoreEntry(
  recordingId: string,
  entry: Omit<MediaLibraryEntry, 'blob'>,
  blob: Blob
): RecordingEntry {
  return {
    blob,
    createdAt: entry.createdAt,
    filename: entry.filename,
    id: recordingId,
    size: blob.size,
  };
}

export function createProjectExportStoreEntry(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  blob: Blob
): ProjectExportEntry {
  if (entry.source.kind !== 'project-export') {
    throw new Error('Project export record builder requires a project-export media entry.');
  }

  return {
    createdAt: entry.createdAt,
    duration: entry.duration ?? 0,
    filename: entry.filename,
    format: entry.mimeType.includes('mp4') ? VideoExportFormat.MP4 : VideoExportFormat.WEBM,
    fps: 30,
    height: entry.height ?? 0,
    id: entry.source.exportId,
    mimeType: entry.mimeType,
    projectId: entry.source.projectId,
    recordingId: entry.source.recordingId,
    size: blob.size,
    width: entry.width ?? 0,
  };
}

export function createProjectAssetStoreEntry(
  entry: Omit<MediaLibraryEntry, 'blob'>,
  blob: Blob
): ProjectAssetEntry {
  if (entry.source.kind !== 'project-asset') {
    throw new Error('Project asset record builder requires a project-asset media entry.');
  }

  return {
    blob,
    createdAt: entry.createdAt,
    id: entry.source.projectAssetId,
    mimeType: entry.mimeType,
    size: blob.size,
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
