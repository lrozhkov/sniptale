import type { MediaAssetKind, MediaLibraryEntry } from './contracts';
import type { ProjectAssetEntry, ProjectExportEntry } from '../projects/contracts';
import type { RecordingEntry } from '../recordings/contracts';
import {
  createProjectAssetMediaId,
  createRecordingMediaId,
} from '../../../features/media-hub/media-id';

type RecordingMediaEntryInput = Omit<RecordingEntry, 'blob'> & {
  blob?: Blob;
  mimeType?: string;
};

function createProjectExportMediaId(exportId: string): string {
  return `export:${exportId}`;
}

function resolveProjectAssetKind(mimeType: string): MediaAssetKind {
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  return 'video';
}

function resolveRecordingAssetKind(mimeType: string): MediaAssetKind {
  return mimeType.startsWith('audio/') ? 'audio' : 'recording';
}

export function mergeMediaEntry(
  existing: MediaLibraryEntry | undefined,
  baseEntry: MediaLibraryEntry
): MediaLibraryEntry {
  if (!existing) {
    return baseEntry;
  }

  const wasRenamed =
    existing.originalFilename !== '' && existing.filename !== existing.originalFilename;

  return {
    ...baseEntry,
    filename: wasRenamed ? existing.filename : baseEntry.filename,
    tags: existing.tags ?? baseEntry.tags,
    sourceUrl: existing.sourceUrl ?? baseEntry.sourceUrl,
    sourceTitle: existing.sourceTitle ?? baseEntry.sourceTitle,
    sourceFavicon: existing.sourceFavicon ?? baseEntry.sourceFavicon,
    ...(() => {
      const blob = existing.blob ?? baseEntry.blob;
      return blob === undefined ? {} : { blob };
    })(),
  };
}

export function buildRecordingMediaEntry(entry: RecordingMediaEntryInput): MediaLibraryEntry {
  const mimeType = entry.blob?.type || entry.mimeType || 'video/webm';
  return {
    id: createRecordingMediaId(entry.id),
    kind: resolveRecordingAssetKind(mimeType),
    source: {
      kind: 'recording',
      recordingId: entry.id,
    },
    filename: entry.filename,
    originalFilename: entry.filename,
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt,
    size: entry.size,
    mimeType,
    width: null,
    height: null,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
  };
}

export function buildProjectExportMediaEntry(entry: ProjectExportEntry): MediaLibraryEntry {
  return {
    id: createProjectExportMediaId(entry.id),
    kind: 'export',
    source: {
      kind: 'project-export',
      exportId: entry.id,
      recordingId: entry.recordingId,
      projectId: entry.projectId,
    },
    filename: entry.filename,
    originalFilename: entry.filename,
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt,
    size: entry.size,
    mimeType: entry.mimeType ?? 'video/webm',
    width: entry.width,
    height: entry.height,
    duration: entry.duration,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
  };
}

export function buildProjectAssetMediaEntry(
  entry: Omit<ProjectAssetEntry, 'blob'>
): MediaLibraryEntry {
  return {
    id: createProjectAssetMediaId(entry.id),
    kind: resolveProjectAssetKind(entry.mimeType),
    source: {
      kind: 'project-asset',
      projectAssetId: entry.id,
    },
    filename: entry.id,
    originalFilename: entry.id,
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt,
    size: entry.size,
    mimeType: entry.mimeType,
    width: null,
    height: null,
    duration: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
  };
}
