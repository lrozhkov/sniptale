import { projectMotionSourcePhases } from '../../../project/motion/source-binding';
import { isVideoProjectUtilityLaneVisible } from '../../../project/utility-lanes';
import { getMotionAnimationTime, motionTransitionSettings } from '../../../project/motion/timing';
import { cameraTransitionProgress } from '../../../project/motion/transitions';
import {
  resolveMotionConnectionSource,
  resolveMotionConnectionEdges,
  resolveMotionConnectionVideo,
} from '../../../project/motion';
import type { VideoProject, VideoProjectMotionRegion } from '../../../project/types';
import { motionConnectionProgress } from '../../motion/math';
import type { VideoCompositionSpotlightState } from '../../types';

/** Resolve Native clocks and compatible morphs before attachment geometry is known. */
export function resolveVideoCompositionSpotlights(project: VideoProject, time: number) {
  project = projectMotionSourcePhases(project);
  const scene: VideoCompositionSpotlightState[] = [];
  const windows = new Map<string, VideoCompositionSpotlightState[]>();
  if (!isVideoProjectUtilityLaneVisible(project, 'camera')) return { scene, windows };
  const videos = new Set(
    project.clips.filter((clip) => clip.type === 'VIDEO').map((clip) => clip.id)
  );
  const regions = (project.motionRegions ?? [])
    .filter(
      (region) =>
        region.spotlight &&
        region.duration > 0 &&
        (!region.sourceBinding || videos.has(region.sourceBinding.clipId))
    )
    .toSorted((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  for (const region of regions) {
    const incoming = resolveMotionConnectionSource(project, region);
    const edges = resolveMotionConnectionEdges(project, region);
    const inGap =
      incoming && time >= incoming.startTime + incoming.duration && time < region.startTime;
    if (!inGap && (time < region.startTime || time >= region.startTime + region.duration)) continue;
    const sampled: VideoCompositionSpotlightState = inGap
      ? {
          id: region.id,
          spotlight: region.spotlight!,
          phase: 'enter',
          progress: motionConnectionProgress(
            region,
            (time - incoming.startTime - incoming.duration) /
              (region.startTime - incoming.startTime - incoming.duration)
          ),
          from: incoming.spotlight!,
        }
      : {
          id: region.id,
          spotlight: region.spotlight!,
          ...sampleSpotlightPhase(region, time, edges.connectedIn, edges.connectedOut),
        };
    const state = {
      ...sampled,
      ...(region.sourceBinding?.coordinateSpace
        ? { coordinateSpace: region.sourceBinding.coordinateSpace }
        : {}),
    };
    const clipId =
      inGap && region.sourceBinding?.coordinateSpace === 'source-window'
        ? resolveMotionConnectionVideo(project, incoming, region, time)?.id
        : region.sourceBinding?.clipId;
    if (region.sourceBinding?.coordinateSpace === 'source-window' && !clipId) continue;
    if (region.spotlightTarget === 'window' && clipId) {
      const states = windows.get(clipId) ?? [];
      states.push(state);
      windows.set(clipId, states);
    } else if (region.spotlightTarget === 'viewport') scene.push(state);
    else if (region.spotlightTarget === 'scene' && clipId) scene.push({ ...state, clipId });
  }
  return { scene, windows };
}

function sampleSpotlightPhase(
  region: VideoProjectMotionRegion,
  time: number,
  connectedIn: boolean,
  connectedOut: boolean
): Pick<VideoCompositionSpotlightState, 'phase' | 'progress'> {
  const local = getMotionAnimationTime(region, time - region.startTime);
  const duration =
    region.animation?.duration ?? region.sourceBinding?.animation.duration ?? region.duration;
  const enter = motionTransitionSettings(region, 'enter');
  const exit = motionTransitionSettings(region, 'exit');
  if (!connectedIn && enter.type !== 'none' && enter.duration > 0 && local < enter.duration)
    return {
      phase: 'enter',
      progress: cameraTransitionProgress(local / enter.duration, enter.type),
    };
  if (
    !connectedOut &&
    exit.type !== 'none' &&
    exit.duration > 0 &&
    local > duration - exit.duration
  )
    return {
      phase: 'exit',
      progress:
        1 - cameraTransitionProgress((local - duration + exit.duration) / exit.duration, exit.type),
    };
  return { phase: 'hold', progress: 1 };
}
