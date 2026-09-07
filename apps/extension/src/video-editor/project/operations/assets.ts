import { getRecording } from '../../../composition/persistence/recordings/index';
import { getAggregatePresentation } from '../../../composition/persistence/aggregate-presentations';
import {
  getMediaAssetBlob,
  getMediaLibraryEntry,
} from '../../../composition/persistence/media-library/index';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import { createVideoProjectAsset } from '../../../features/video/project/factories/creation';
import { saveProjectAssetSafely } from '../../../workflows/media-hub/store';
import { translate } from '../../../platform/i18n';
import {
  VideoProjectAssetType,
  type VideoProject,
  type VideoProjectAsset,
} from '../../../features/video/project/types';
import { loadAudioMetadata, loadImageMetadata, loadVideoMetadata } from '../media-metadata';
import { assertImportableProjectAssetFile } from './import-validation';

type ImportableProjectAssetType =
  | typeof VideoProjectAssetType.IMAGE
  | typeof VideoProjectAssetType.VIDEO
  | typeof VideoProjectAssetType.AUDIO;

function findExistingRecordingAsset(
  project: VideoProject,
  sourceRecordingId: string
): VideoProjectAsset | undefined {
  return project.assets.find((asset) => {
    if (asset.type !== VideoProjectAssetType.RECORDING) {
      return false;
    }

    if (asset.source.kind === 'recording') {
      return asset.source.recordingId === sourceRecordingId;
    }

    if (asset.source.kind !== 'project-asset') {
      return false;
    }

    return asset.source.originRecordingId === sourceRecordingId;
  });
}

async function buildProjectRecordingAsset(
  sourceRecordingId: string,
  blob: Blob,
  filename: string
): Promise<VideoProjectAsset> {
  const metadata = await loadVideoMetadata(blob);
  const projectAssetId = crypto.randomUUID();

  await saveProjectAssetSafely(projectAssetId, blob, metadata.mimeType, filename);

  return createVideoProjectAsset(
    filename,
    VideoProjectAssetType.RECORDING,
    {
      kind: 'project-asset',
      projectAssetId,
      originRecordingId: sourceRecordingId,
    },
    {
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      mimeType: metadata.mimeType,
      size: metadata.size,
      hasAudio: metadata.hasAudio,
      audioPeaks: metadata.audioPeaks,
    }
  );
}

/**
 * Ensures a project contains a media asset wrapper for a recording.
 */
export async function ensureRecordingAsset(
  project: VideoProject,
  sourceRecordingId: string
): Promise<VideoProjectAsset | null> {
  const existing = findExistingRecordingAsset(project, sourceRecordingId);

  if (existing) {
    return existing;
  }

  const entry = await getRecording(sourceRecordingId);
  if (!entry) {
    throw new Error(translate('videoEditor.app.recordingNotFound'));
  }

  return buildProjectRecordingAsset(sourceRecordingId, entry.file, entry.filename);
}

export async function importRecordingProjectAsset(
  sourceRecordingId: string
): Promise<VideoProjectAsset> {
  const entry = await getRecording(sourceRecordingId);
  if (!entry) {
    throw new Error(translate('videoEditor.app.recordingNotFound'));
  }

  return buildProjectRecordingAsset(sourceRecordingId, entry.file, entry.filename);
}

/** Copies library media into the project, preserving recording telemetry provenance. */
export async function ensureLibraryMediaAsset(
  project: VideoProject,
  mediaId: string
): Promise<VideoProjectAsset | null> {
  const existing = project.assets.find(
    (asset) => asset.source.kind === 'project-asset' && asset.source.originMediaId === mediaId
  );
  if (existing) return existing;

  const entry = await getMediaLibraryEntry(mediaId);
  if (!entry) throw new Error(translate('videoEditor.sidebar.libraryMediaUnavailable'));
  const assetType = getLibraryImportType(entry);
  if (entry.source.kind === 'recording') {
    return ensureRecordingAsset(project, entry.source.recordingId);
  }

  const blob = await readLibraryImportBlob(entry, assetType);
  if (!blob) throw new Error(translate('videoEditor.sidebar.libraryMediaUnavailable'));
  const file = new File([blob], entry.filename, { type: blob.type });
  const asset = await importProjectAsset(file, assetType);
  if (asset.source.kind === 'project-asset') {
    asset.source.originMediaId = mediaId;
  }
  return asset;
}

function getLibraryImportType(entry: MediaLibraryEntry): ImportableProjectAssetType {
  if (entry.source.kind !== 'web-snapshot') {
    if (entry.kind === 'image' || entry.kind === 'screenshot') return VideoProjectAssetType.IMAGE;
    if (entry.kind === 'video' || entry.kind === 'recording' || entry.kind === 'export') {
      return VideoProjectAssetType.VIDEO;
    }
  }
  throw new Error(translate('videoEditor.app.importAssetUnsupported'));
}

async function readLibraryImportBlob(
  entry: MediaLibraryEntry,
  assetType: ImportableProjectAssetType
): Promise<Blob | undefined> {
  if (assetType !== VideoProjectAssetType.IMAGE) return getMediaAssetBlob(entry.id);
  const presentation = await getAggregatePresentation({ id: entry.id, kind: 'image' });
  return presentation?.presentationRevision === (entry.workspaceRevision ?? 0)
    ? presentation.previewBlob
    : undefined;
}

async function buildImportedImageAsset(file: File): Promise<VideoProjectAsset> {
  const metadata = await loadImageMetadata(file);
  const projectAssetId = crypto.randomUUID();

  await saveProjectAssetSafely(projectAssetId, file, metadata.mimeType, file.name);

  return createVideoProjectAsset(
    file.name,
    VideoProjectAssetType.IMAGE,
    {
      kind: 'project-asset',
      projectAssetId,
    },
    {
      width: metadata.width,
      height: metadata.height,
      duration: null,
      mimeType: metadata.mimeType,
      size: metadata.size,
      hasAudio: false,
      audioPeaks: null,
    }
  );
}

async function buildImportedVideoAsset(file: File): Promise<VideoProjectAsset> {
  const metadata = await loadVideoMetadata(file);
  const projectAssetId = crypto.randomUUID();

  await saveProjectAssetSafely(projectAssetId, file, metadata.mimeType, file.name);

  return createVideoProjectAsset(
    file.name,
    VideoProjectAssetType.VIDEO,
    {
      kind: 'project-asset',
      projectAssetId,
    },
    {
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      mimeType: metadata.mimeType,
      size: metadata.size,
      hasAudio: metadata.hasAudio,
      audioPeaks: metadata.audioPeaks,
    }
  );
}

async function buildImportedAudioAsset(file: File): Promise<VideoProjectAsset> {
  const metadata = await loadAudioMetadata(file);
  const projectAssetId = crypto.randomUUID();

  await saveProjectAssetSafely(projectAssetId, file, metadata.mimeType, file.name);

  return createVideoProjectAsset(
    file.name,
    VideoProjectAssetType.AUDIO,
    {
      kind: 'project-asset',
      projectAssetId,
    },
    {
      width: 0,
      height: 0,
      duration: metadata.duration,
      mimeType: metadata.mimeType,
      size: metadata.size,
      hasAudio: true,
      audioPeaks: metadata.audioPeaks,
    }
  );
}

/**
 * Persists an imported file and wraps it into a project asset.
 */
export async function importProjectAsset(
  file: File,
  assetType: ImportableProjectAssetType
): Promise<VideoProjectAsset> {
  await assertImportableProjectAssetFile(file, assetType);

  if (assetType === VideoProjectAssetType.AUDIO) {
    return buildImportedAudioAsset(file);
  }

  if (assetType === VideoProjectAssetType.IMAGE) {
    return buildImportedImageAsset(file);
  }

  return buildImportedVideoAsset(file);
}
