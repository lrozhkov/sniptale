import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import {
  getLinkedClipIds,
  isVideoClip,
  resolveClipLogicalLaneId,
} from '../../../../features/video/project/timeline';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import { isVideoProjectUtilityLaneLocked } from '../../../../features/video/project/utility-lanes';
import { createShiftedClipStartPatch } from './clip-shifts';

type ClipShift = { clipIds: ReadonlySet<string>; delta: number };
export type ClipSwapPlan =
  | { status: 'ready'; neighborName: string; shifts: readonly ClipShift[] }
  | { status: 'unavailable'; reason: 'no-neighbor' | 'overlap' | 'locked' | 'collision' };

/** Swaps adjacent temporal groups while retaining independent project-time layers and the gap. */
export function planClipSwap(
  project: VideoProject,
  clipId: string,
  direction: 'left' | 'right'
): ClipSwapPlan {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip) return { status: 'unavailable', reason: 'no-neighbor' };
  const selected = getGroup(project, clip);
  const reference = getOrderingReference(project, selected.clips, clip);
  const lane = project.clips
    .filter((item) => !selected.ids.has(item.id) && sameLane(reference, item))
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  const neighbor =
    direction === 'left'
      ? lane.filter((item) => item.startTime < reference.startTime).at(-1)
      : lane.find((item) => item.startTime >= reference.startTime);
  if (!neighbor) return { status: 'unavailable', reason: 'no-neighbor' };
  const other = getGroup(project, neighbor);
  const [left, right] = direction === 'left' ? [other, selected] : [selected, other];
  const gap = right.start - left.end;
  if (gap < -1e-9 || [...selected.ids].some((id) => other.ids.has(id)))
    return { status: 'unavailable', reason: 'overlap' };
  const affected = new Set([...selected.ids, ...other.ids]);
  if (
    project.clips.some(
      (item) =>
        affected.has(item.id) &&
        !project.tracks.some((track) => track.id === item.trackId && !track.locked)
    ) ||
    hasLockedAnchors(project, affected)
  )
    return { status: 'unavailable', reason: 'locked' };
  const shifts = [
    { clipIds: left.ids, delta: right.end - left.end },
    { clipIds: right.ids, delta: left.start - right.start },
  ];
  const stationary = project.clips.filter((item) => !affected.has(item.id));
  for (const shift of shifts) {
    for (const item of project.clips.filter((candidate) => shift.clipIds.has(candidate.id))) {
      const start = item.startTime + shift.delta;
      if (
        stationary.some(
          (candidate) =>
            sameLane(item, candidate) &&
            start < candidate.startTime + candidate.duration - 1e-9 &&
            start + item.duration > candidate.startTime + 1e-9
        )
      )
        return { status: 'unavailable', reason: 'collision' };
    }
  }
  return { status: 'ready', neighborName: neighbor.name, shifts };
}

/** Publishes both groups in one mutation; the store owns history and source-anchor reconciliation. */
export function swapProjectClips(
  project: VideoProject,
  clipId: string,
  direction: 'left' | 'right'
): VideoProject {
  const plan = planClipSwap(project, clipId, direction);
  if (plan.status !== 'ready') return project;
  let next = project;
  for (const shift of plan.shifts)
    next = { ...next, ...createShiftedClipStartPatch({ project: next, ...shift }) };
  return applyVideoProjectMutationPatch(project, {
    clips: next.clips,
    ...(project.effectInstances ? { effectInstances: shiftClipEffects(project, plan.shifts) } : {}),
  });
}

function getGroup(project: VideoProject, clip: VideoProjectClip) {
  const ids = new Set(getLinkedClipIds(project, clip.id));
  const clips = project.clips.filter((item) => ids.has(item.id));
  return {
    ids,
    clips,
    start: Math.min(...clips.map((item) => item.startTime)),
    end: Math.max(...clips.map((item) => item.startTime + item.duration)),
  };
}

function getOrderingReference(
  project: VideoProject,
  clips: VideoProjectClip[],
  fallback: VideoProjectClip
) {
  const primary = clips.find(
    (clip) =>
      isVideoClip(clip) &&
      project.assets.some(
        (asset) => asset.id === clip.assetId && asset.recordingPart?.role === 'primary'
      )
  );
  return (
    primary ??
    clips.find((clip) =>
      project.tracks.some((track) => track.id === clip.trackId && track.isRoot)
    ) ??
    fallback
  );
}

function sameLane(left: VideoProjectClip, right: VideoProjectClip) {
  return (
    left.trackId === right.trackId &&
    resolveClipLogicalLaneId(left) === resolveClipLogicalLaneId(right)
  );
}

function hasLockedAnchors(project: VideoProject, affected: ReadonlySet<string>): boolean {
  const events = project.actionEvents.filter(
    (event) => event.sourceAnchor && affected.has(event.sourceAnchor.sourceClipId)
  );
  return (
    (events.length > 0 && isVideoProjectUtilityLaneLocked(project, 'actions')) ||
    (isVideoProjectUtilityLaneLocked(project, 'camera') &&
      Boolean(
        project.motionRegions?.some((region) =>
          events.some((event) => event.id === region.targetActionEventId)
        )
      ))
  );
}

function shiftClipEffects(project: VideoProject, shifts: readonly ClipShift[]) {
  return project.effectInstances!.flatMap((instance) => {
    if (instance.target.kind !== 'clip') return [instance];
    const targetId = instance.target.clipId;
    const shift = shifts.find((item) => item.clipIds.has(targetId));
    if (!shift) return [instance];
    const rawStart = instance.startTime + shift.delta;
    const cropped = Math.max(0, -rawStart);
    if (cropped >= instance.duration) return [];
    return [
      {
        ...instance,
        startTime: Math.max(0, rawStart),
        duration: instance.duration - cropped,
        ...(cropped > 0
          ? { sourceStart: (instance.sourceStart ?? 0) + cropped * instance.playbackRate }
          : {}),
      },
    ];
  });
}
