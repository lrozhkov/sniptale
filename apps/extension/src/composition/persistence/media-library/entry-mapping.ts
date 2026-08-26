import type { MediaAssetKind, MediaLibraryEntry } from './contracts';
import type { StoredProjectAssetEntry, StoredProjectExportEntry } from '../projects/contracts';
import type { StoredRecordingEntry } from '../recordings/contracts';
import {
  createProjectAssetMediaId,
  createProjectExportMediaId,
  createRecordingMediaId,
} from '../../../features/media-hub/media-id';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';

type RecordingMediaEntryInput = StoredRecordingEntry;

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
    ...(existing.lifecycle ? { lifecycle: existing.lifecycle } : {}),
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
  const mimeType = entry.mimeType;
  return {
    id: createRecordingMediaId(entry.id),
    kind: entry.mediaMetadata?.kind ?? resolveRecordingAssetKind(mimeType),
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
    width: entry.mediaMetadata?.width ?? entry.recordingGroup?.dimensions?.width ?? null,
    height: entry.mediaMetadata?.height ?? entry.recordingGroup?.dimensions?.height ?? null,
    duration: entry.mediaMetadata?.duration ?? null,
    sourceUrl: sanitizeProvenanceUrl(entry.recordingGroup?.sourceUrl),
    sourceTitle: entry.recordingGroup?.sourceLabel ?? null,
    sourceFavicon: sanitizeProvenanceUrl(entry.recordingGroup?.sourceFavicon),
    tags: [],
    lifecycle: entry.lifecycle ?? createLibraryLifecycle('library', entry.createdAt),
    ...(entry.recordingGroup ? { recordingGroup: entry.recordingGroup } : {}),
  };
}

export function buildProjectExportMediaEntry(entry: StoredProjectExportEntry): MediaLibraryEntry {
  return {
    id: createProjectExportMediaId(entry.id),
    kind: 'export',
    source: {
      kind: 'project-export',
      exportId: entry.id,
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
    lifecycle: createLibraryLifecycle('library', entry.createdAt),
  };
}

export function buildProjectAssetMediaEntry(entry: StoredProjectAssetEntry): MediaLibraryEntry {
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
    lifecycle: createLibraryLifecycle('temporary', entry.createdAt),
  };
}
