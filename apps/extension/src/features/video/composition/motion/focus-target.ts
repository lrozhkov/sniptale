import { motionFocusAreaScale } from '../../project/motion/focus-area';
import { motionWindowFocusToComposition } from './source-window';
import { getDefaultFocusPoint } from './defaults';
import { getMotionFocusAreaCenter } from '../../project/motion';
import {
  VideoMotionFocusMode,
  type VideoProject,
  type VideoProjectMotionRegion,
} from '../../project/types';
import { resolveVideoProjectActionOccurrences } from '../../project/action-occurrences';
import { resolveVideoCompositionActionSourceMapping } from '../timeline/frame/actions';
import { mapSourceNormalizedPointToVisualLayer } from '../draw/fitted-media';

function resolveActionFocusPoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  currentTime: number
) {
  const fallback = motionWindowFocusToComposition(
    project,
    region,
    region.focusPoint ?? getDefaultFocusPoint(project),
    currentTime
  );
  const target = region.targetAction;
  const occurrence =
    target &&
    resolveVideoProjectActionOccurrences(project).find(
      (item) => item.eventId === target.eventId && item.clipId === target.clipId
    );
  if (!occurrence) return fallback;
  const point = occurrence.event.presentation?.point ?? occurrence.event.point;
  if (!point) return fallback;
  if (occurrence.clipId === null) return point;
  const clip = project.clips.find((item) => item.id === occurrence.clipId);
  if (project.tracks.find((track) => track.id === clip?.trackId)?.role === 'CAMERA')
    return fallback;
  const mapping = resolveVideoCompositionActionSourceMapping(project, occurrence, currentTime);
  return (mapping && mapSourceNormalizedPointToVisualLayer({ ...mapping, point })) ?? fallback;
}

/** Resolve manual and action targets in the region's authored coordinate space. */
export function resolveManualMotionFocusPoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  currentTime: number
) {
  if (region.focusMode === VideoMotionFocusMode.MANUAL_AREA && region.focusArea)
    return getMotionFocusAreaCenter(region.focusArea);
  if (region.focusMode === VideoMotionFocusMode.ACTION)
    return motionWindowFocusToComposition(
      project,
      region,
      resolveActionFocusPoint(project, region, currentTime),
      currentTime,
      true
    );
  return region.focusPoint ?? getDefaultFocusPoint(project);
}

/** Resolve the authoring target scale before a camera phase or link applies. */
export function resolveMotionTargetScale(
  project: VideoProject,
  activeRegion: VideoProjectMotionRegion
): number {
  if (activeRegion.focusMode !== VideoMotionFocusMode.MANUAL_AREA || !activeRegion.focusArea) {
    return activeRegion.scale;
  }

  return motionFocusAreaScale(project, activeRegion.focusArea);
}
