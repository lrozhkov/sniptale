import {
  mapSourceNormalizedPointToVisualLayer,
  mapVisualLayerPointToSourceNormalized,
} from './draw/fitted-media';
import { mapCompositionPointThroughCamera, mapViewportPointToComposition } from './motion';
import { resolveVideoCompositionActionSourceMapping } from './timeline/frame/actions';
import type { VideoCompositionCameraState } from './types';
import type { VideoProjectActionOccurrence } from '../project/action-occurrences';
import {
  type VideoProject,
  type VideoProjectClip,
  VideoMotionOverlayZoomMode,
  VideoProjectClipType,
  VideoProjectTrackRole,
} from '../project/types/index';

export function shouldLockVideoClipToViewport(
  clip: Pick<VideoProjectClip, 'type' | 'trackId'>,
  camera: VideoCompositionCameraState,
  project: Pick<VideoProject, 'tracks'>
) {
  if (
    clip.type === VideoProjectClipType.VIDEO &&
    project.tracks.find((track) => track.id === clip.trackId)?.role === VideoProjectTrackRole.CAMERA
  ) {
    return true;
  }
  if (
    (camera.overlayZoomMode ?? VideoMotionOverlayZoomMode.LOCK_OVERLAYS) !==
    VideoMotionOverlayZoomMode.LOCK_OVERLAYS
  ) {
    return false;
  }

  switch (clip.type) {
    case VideoProjectClipType.TEXT:
    case VideoProjectClipType.SUBTITLE:
    case VideoProjectClipType.ANNOTATION:
    case VideoProjectClipType.EFFECT:
    case VideoProjectClipType.SHAPE:
      return true;
    case VideoProjectClipType.VIDEO:
    case VideoProjectClipType.IMAGE:
    case VideoProjectClipType.AUDIO:
      return false;
  }
}

/** Direct editing is unavailable for arbitrary effect warps without an inverse mapping. */
export function canEditVideoActionOccurrence(
  project: VideoProject,
  occurrence: VideoProjectActionOccurrence,
  currentTime: number
): boolean {
  if (!Number.isFinite(currentTime)) return false;
  if (occurrence.clipId === null) return true;
  const clip = project.clips.find((item) => item.id === occurrence.clipId);
  if (!clip || currentTime < clip.startTime || currentTime >= clip.startTime + clip.duration)
    return false;
  return !(project.effectInstances ?? []).some(
    (effect) =>
      effect.enabled &&
      currentTime >= effect.startTime &&
      currentTime < effect.startTime + effect.duration &&
      ((effect.target.kind === 'clip' && effect.target.clipId === clip.id) ||
        (effect.target.kind === 'transition' &&
          project.transitions?.some(
            (transition) =>
              'transitionId' in effect.target &&
              transition.id === effect.target.transitionId &&
              (transition.leadingClipId === clip.id || transition.trailingClipId === clip.id)
          )))
  );
}

export function mapVideoActionOccurrencePointToScene(
  project: VideoProject,
  occurrence: VideoProjectActionOccurrence,
  currentTime: number,
  camera: VideoCompositionCameraState
) {
  if (!canEditVideoActionOccurrence(project, occurrence, currentTime)) return null;
  const point = occurrence.event.presentation?.point ?? occurrence.event.point;
  if (!point || occurrence.clipId === null) return point;
  const mapping = resolveVideoCompositionActionSourceMapping(project, occurrence, currentTime);
  const mapped = mapping && mapSourceNormalizedPointToVisualLayer({ ...mapping, point });
  const clip = project.clips.find((item) => item.id === occurrence.clipId);
  return mapped && clip && shouldLockVideoClipToViewport(clip, camera, project)
    ? mapViewportPointToComposition(mapped, camera)
    : mapped;
}

export function mapScenePointToVideoActionOccurrence(
  project: VideoProject,
  occurrence: VideoProjectActionOccurrence,
  currentTime: number,
  camera: VideoCompositionCameraState,
  point: { x: number; y: number }
) {
  if (!canEditVideoActionOccurrence(project, occurrence, currentTime)) return null;
  if (occurrence.clipId === null) return point;
  const clip = project.clips.find((item) => item.id === occurrence.clipId);
  const mapped =
    clip && shouldLockVideoClipToViewport(clip, camera, project)
      ? mapCompositionPointThroughCamera(point, camera)
      : point;
  const mapping = resolveVideoCompositionActionSourceMapping(project, occurrence, currentTime);
  return mapping ? mapVisualLayerPointToSourceNormalized({ ...mapping, point: mapped }) : null;
}
