import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
} from '../../../features/video/project/factories/clip';
import {
  createAnnotationClip,
  createShapeClip,
  createSubtitleClip,
  createTextClip,
} from '../../../features/video/project/factories/overlay-clip';
import {
  expandVideoBlockRecipe,
  getVideoBlockRecipeDefinition,
} from '../../../features/video/project/blocks/recipes';
import type {
  VideoBlockKind,
  VideoProject,
  VideoProjectAsset,
} from '../../../features/video/project/types/index';
import type { VideoAnnotationTemplateInput } from '../../../features/video/project/annotation/template';
import { VideoProjectAssetType, VideoTrackKind } from '../../../features/video/project/types/index';
import type { VideoEditorProjectState } from './contracts';
import {
  assignClipTimelineLane,
  buildInsertedClipResult,
  type AddAssetClipResult,
} from './asset-shared';
import { ensureTrackForKind } from './helpers';
import { addVideoAssetClip } from './asset-video-actions';

function addImageAssetClip(
  project: VideoProject,
  asset: VideoProjectAsset,
  preferredTrackId: string | null,
  insertionTime: number,
  timelineLaneId?: string | null
): AddAssetClipResult {
  const overlayTrack = ensureTrackForKind(project, VideoTrackKind.OVERLAY, preferredTrackId);
  const clip = assignClipTimelineLane(
    createVideoClipFromAsset(
      overlayTrack.trackId,
      asset,
      project.width,
      project.height,
      insertionTime
    ),
    timelineLaneId
  );

  return buildInsertedClipResult({
    asset,
    clips: [clip],
    project: overlayTrack.project,
    selectedClipId: clip.id,
    selectedTrackId: clip.trackId,
  });
}

function addAudioAssetClip(
  project: VideoProject,
  asset: VideoProjectAsset,
  preferredTrackId: string | null,
  insertionTime: number,
  timelineLaneId?: string | null
): AddAssetClipResult {
  const audioTrack = ensureTrackForKind(project, VideoTrackKind.AUDIO, preferredTrackId);
  const clip = assignClipTimelineLane(
    createAudioClipFromAsset(audioTrack.trackId, asset, insertionTime),
    timelineLaneId
  );

  return buildInsertedClipResult({
    asset,
    clips: [clip],
    project: audioTrack.project,
    selectedClipId: clip.id,
    selectedTrackId: clip.trackId,
  });
}

export function addAssetClipToProject(
  project: VideoProject,
  asset: VideoProjectAsset,
  preferredTrackId: string | null,
  insertionTime: number,
  timelineLaneId?: string | null
): AddAssetClipResult {
  if (asset.type === VideoProjectAssetType.IMAGE) {
    return addImageAssetClip(project, asset, preferredTrackId, insertionTime, timelineLaneId);
  }

  if (asset.type === VideoProjectAssetType.AUDIO) {
    return addAudioAssetClip(project, asset, preferredTrackId, insertionTime, timelineLaneId);
  }

  return addVideoAssetClip(project, asset, preferredTrackId, insertionTime, timelineLaneId);
}

export function addTextOverlayToProject(
  project: VideoProject,
  preferredTrackId: string | null,
  insertionTime: number
): AddAssetClipResult {
  const overlayTrack = ensureTrackForKind(project, VideoTrackKind.OVERLAY, preferredTrackId);
  const clip = createTextClip(overlayTrack.trackId, project.width, project.height, insertionTime);

  return buildInsertedClipResult({
    clips: [clip],
    project: overlayTrack.project,
    selectedClipId: clip.id,
    selectedTrackId: clip.trackId,
  });
}

export function addAnnotationOverlayToProject(
  project: VideoProject,
  preferredTrackId: string | null,
  insertionTime: number,
  templateInput?: VideoAnnotationTemplateInput
): AddAssetClipResult {
  const overlayTrack = ensureTrackForKind(project, VideoTrackKind.OVERLAY, preferredTrackId);
  const clip = createAnnotationClip(
    overlayTrack.trackId,
    project.width,
    project.height,
    insertionTime,
    templateInput
  );

  return buildInsertedClipResult({
    clips: [clip],
    project: overlayTrack.project,
    selectedClipId: clip.id,
    selectedTrackId: clip.trackId,
  });
}

export function addSubtitleOverlayToProject(
  project: VideoProject,
  preferredTrackId: string | null,
  insertionTime: number
): AddAssetClipResult {
  const subtitleTrack = ensureTrackForKind(project, VideoTrackKind.SUBTITLE, preferredTrackId);
  const clip = createSubtitleClip(
    subtitleTrack.trackId,
    project.width,
    project.height,
    insertionTime
  );

  return buildInsertedClipResult({
    clips: [clip],
    project: subtitleTrack.project,
    selectedClipId: clip.id,
    selectedTrackId: clip.trackId,
  });
}

export function addVideoBlockToProject(
  project: VideoProject,
  blockKind: VideoBlockKind,
  preferredTrackId: string | null,
  insertionTime: number
): AddAssetClipResult {
  const definition = getVideoBlockRecipeDefinition(blockKind);
  const blockTrack = ensureTrackForKind(project, definition.trackKind, preferredTrackId);
  const clips = expandVideoBlockRecipe(
    blockKind,
    blockTrack.trackId,
    blockTrack.project,
    insertionTime
  );

  return buildInsertedClipResult({
    clips,
    project: blockTrack.project,
    selectedClipId: clips[0]?.id ?? null,
    selectedTrackId: blockTrack.trackId,
  });
}

export function addShapeOverlayToProject(
  project: VideoProject,
  preferredTrackId: string | null,
  insertionTime: number,
  shapeType: Parameters<VideoEditorProjectState['addShapeOverlay']>[0]
): AddAssetClipResult {
  const overlayTrack = ensureTrackForKind(project, VideoTrackKind.OVERLAY, preferredTrackId);
  const clip = createShapeClip(
    overlayTrack.trackId,
    project.width,
    project.height,
    insertionTime,
    shapeType
  );

  return buildInsertedClipResult({
    clips: [clip],
    project: overlayTrack.project,
    selectedClipId: clip.id,
    selectedTrackId: clip.trackId,
  });
}
