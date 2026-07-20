import { getRecording } from '../../../composition/persistence/recordings/index';
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

  return buildProjectRecordingAsset(sourceRecordingId, entry.blob, entry.filename);
}

export async function importRecordingProjectAsset(
  sourceRecordingId: string
): Promise<VideoProjectAsset> {
  const entry = await getRecording(sourceRecordingId);
  if (!entry) {
    throw new Error(translate('videoEditor.app.recordingNotFound'));
  }

  return buildProjectRecordingAsset(sourceRecordingId, entry.blob, entry.filename);
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
