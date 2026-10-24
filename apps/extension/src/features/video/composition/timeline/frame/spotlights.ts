import { resolveClipTransitionVisualState } from '../../../project/transition/presentation';
import { buildProjectTransitionSegments } from '../../../project/transition/project';
import { getClipCompositeVisualOpacity } from '../../../project/timeline/presentation';
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
import { VideoMotionFocusMode } from '../../../project/types';
import { resolveProjectCursorFocus } from '../../../project/cursor-focus-path/projection';
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
          ...sampleSpotlightPhase(region, time, edges.connectedIn, edges.connectedOut, project),
        };
    const clipId =
      inGap && region.sourceBinding?.coordinateSpace === 'source-window'
        ? resolveMotionConnectionVideo(project, incoming, region, time)?.id
        : region.sourceBinding?.clipId;
    if (region.sourceBinding?.coordinateSpace === 'source-window' && !clipId) continue;
    const cursor =
      region.spotlight?.effect === 'magnify' && region.focusMode === VideoMotionFocusMode.CURSOR
        ? resolveProjectCursorFocus(project, time, undefined, clipId)
        : null;
    const state = {
      ...sampled,
      ...(region.sourceBinding?.coordinateSpace
        ? { coordinateSpace: region.sourceBinding.coordinateSpace }
        : {}),
      ...(cursor
        ? { lensFocus: { x: cursor.x / project.width, y: cursor.y / project.height } }
        : {}),
    };
    if (region.spotlightTarget === 'window' && clipId) {
      const states = windows.get(clipId) ?? [];
      states.push(state);
      windows.set(clipId, states);
    } else if (region.spotlightTarget === 'viewport') scene.push(state);
    else if (region.spotlightTarget === 'scene' && clipId) scene.push({ ...state, clipId });
    else if (region.spotlightTarget === 'source-scene' && clipId)
      scene.push({ ...state, clipId, afterClipId: clipId });
  }
  joinSourceTransitionMasks(project, time, regions, scene);
  return { scene, windows };
}

function joinSourceTransitionMasks(
  project: VideoProject,
  time: number,
  regions: readonly VideoProjectMotionRegion[],
  states: VideoCompositionSpotlightState[]
) {
  if (!states.some((state) => state.afterClipId)) return;
  const segments = buildProjectTransitionSegments(project).filter(
    (segment) => time >= segment.start && time < segment.end
  );
  if (!segments.length) return;
  const byId = new Map(states.map((state) => [state.id, state]));
  const groups = new Map<
    string,
    { clipIds: Set<string>; states: VideoCompositionSpotlightState[] }
  >();
  for (const region of regions) {
    const binding = region.sourceBinding;
    if (region.spotlightTarget !== 'source-scene' || !binding?.animationGroupId) continue;
    const group = groups.get(binding.animationGroupId) ?? {
      clipIds: new Set<string>(),
      states: [],
    };
    group.clipIds.add(binding.clipId);
    const state = byId.get(region.id);
    if (state) group.states.push(state);
    groups.set(binding.animationGroupId, group);
  }
  if (!groups.size) return;
  for (const segment of segments) {
    const pair = [segment.leadingClipId, segment.trailingClipId];
    const clips = project.clips.filter((clip) => pair.includes(clip.id) && clip.type === 'VIDEO');
    const last = clips
      .filter(
        (clip) =>
          getClipCompositeVisualOpacity(project, clip, time) > 0 &&
          project.tracks.some((track) => track.id === clip.trackId && track.visible)
      )
      .toSorted((a, b) => b.startTime - a.startTime)[0];
    const alpha = clips.reduce(
      (sum, clip) => sum + resolveClipTransitionVisualState(project, clip, time).opacityMultiplier,
      0
    );
    if (!last) continue;
    for (const [groupId, group] of groups) {
      if (!pair.every((id) => group.clipIds.has(id))) continue;
      for (const state of group.states) {
        if (!state.clipId || !pair.includes(state.clipId)) continue;
        state.afterClipId = last.id;
        state.sourceTransition = {
          id: JSON.stringify([segment.transition.id, groupId]),
          leadingClipId: segment.leadingClipId,
          trailingClipId: segment.trailingClipId,
          // Complementary Native fades blend coverage. Full overlapping exposures retain union coverage.
          ...(alpha <= 1 + 4 * Number.EPSILON ? { blend: true as const } : {}),
        };
      }
    }
  }
}

function sampleSpotlightPhase(
  region: VideoProjectMotionRegion,
  time: number,
  connectedIn: boolean,
  connectedOut: boolean,
  project: VideoProject
): Pick<VideoCompositionSpotlightState, 'phase' | 'progress'> {
  const local = getMotionAnimationTime(region, time - region.startTime, project);
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
