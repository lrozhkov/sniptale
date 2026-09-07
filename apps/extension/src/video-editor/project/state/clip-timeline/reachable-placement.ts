import { resolveClipLogicalLaneId } from '../../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';

const TIMELINE_GAP_EPSILON = 0.0001;
const MIN_REACHABLE_CLIP_EDGE_SECONDS = 0.1;

/** Timing edits stop at separated neighbors; authored overlaps keep both clips reachable. */
export function getReachableClipTimingBounds(
  project: VideoProject,
  clip: VideoProjectClip,
  excludedIds: ReadonlySet<string> = new Set()
) {
  const bounds = { minimumStart: 0, maximumStart: Infinity, minimumEnd: 0, maximumEnd: Infinity };
  const end = clip.startTime + clip.duration;
  for (const neighbor of project.clips) {
    if (
      neighbor.id === clip.id ||
      excludedIds.has(neighbor.id) ||
      !clipsShareTimelinePlacementLane(clip, neighbor)
    )
      continue;
    const neighborEnd = neighbor.startTime + neighbor.duration;
    if (neighbor.startTime < clip.startTime) {
      const separated = neighborEnd <= clip.startTime + TIMELINE_GAP_EPSILON;
      bounds.minimumStart = Math.max(
        bounds.minimumStart,
        Math.min(
          clip.startTime,
          separated ? neighborEnd : neighbor.startTime + MIN_REACHABLE_CLIP_EDGE_SECONDS
        )
      );
      if (!separated)
        bounds.minimumEnd = Math.max(
          bounds.minimumEnd,
          Math.min(end, neighborEnd + MIN_REACHABLE_CLIP_EDGE_SECONDS)
        );
    } else if (neighbor.startTime > clip.startTime) {
      const separated = neighbor.startTime >= end - TIMELINE_GAP_EPSILON;
      bounds.maximumEnd = Math.min(
        bounds.maximumEnd,
        Math.max(
          end,
          separated ? neighbor.startTime : neighborEnd - MIN_REACHABLE_CLIP_EDGE_SECONDS
        )
      );
      if (!separated)
        bounds.maximumStart = Math.min(
          bounds.maximumStart,
          Math.max(clip.startTime, neighbor.startTime - MIN_REACHABLE_CLIP_EDGE_SECONDS)
        );
    } else {
      bounds.minimumStart = Math.max(bounds.minimumStart, clip.startTime);
      bounds.maximumEnd = Math.min(bounds.maximumEnd, end);
    }
  }
  return bounds;
}

interface ReachableClipOperation {
  clip: VideoProjectClip;
  clipIdSet: ReadonlySet<string>;
}

export function resolveReachableClipStartTime(props: {
  operation: ReachableClipOperation;
  project: VideoProject;
  startTime: number;
  trackId?: string;
  timelineLaneId?: string | null;
}): number {
  const targetClip = createMovedClipPlacementProbe(props);
  const laneClips = props.project.clips.filter(
    (clip) =>
      !props.operation.clipIdSet.has(clip.id) && clipsShareTimelinePlacementLane(clip, targetClip)
  );
  if (!hasFullContainment(targetClip, laneClips)) {
    return props.startTime;
  }

  const resolvedStart = laneClips
    .flatMap((clip) => createReachableStartCandidates(targetClip, clip))
    .map((candidate) => Math.max(0, candidate))
    .filter((candidate) => !hasFullContainment({ ...targetClip, startTime: candidate }, laneClips))
    .sort((left, right) => Math.abs(left - props.startTime) - Math.abs(right - props.startTime))[0];

  return resolvedStart ?? props.startTime;
}

function createMovedClipPlacementProbe(props: {
  operation: ReachableClipOperation;
  startTime: number;
  timelineLaneId?: string | null;
  trackId?: string;
}): VideoProjectClip {
  return {
    ...props.operation.clip,
    startTime: props.startTime,
    trackId: props.trackId ?? props.operation.clip.trackId,
    ...(props.timelineLaneId !== undefined ? { timelineLaneId: props.timelineLaneId } : {}),
  };
}

function clipsShareTimelinePlacementLane(
  left: Pick<VideoProjectClip, 'timelineLaneId' | 'trackId'>,
  right: Pick<VideoProjectClip, 'timelineLaneId' | 'trackId'>
): boolean {
  return (
    left.trackId === right.trackId &&
    resolveClipLogicalLaneId(left) === resolveClipLogicalLaneId(right)
  );
}

function hasFullContainment(
  movingClip: VideoProjectClip,
  laneClips: readonly VideoProjectClip[]
): boolean {
  return laneClips.some((clip) => clipsFullyContainEachOther(movingClip, clip));
}

function clipsFullyContainEachOther(
  movingClip: VideoProjectClip,
  existingClip: VideoProjectClip
): boolean {
  const movingEnd = movingClip.startTime + movingClip.duration;
  const existingEnd = existingClip.startTime + existingClip.duration;
  return (
    (movingClip.startTime >= existingClip.startTime - TIMELINE_GAP_EPSILON &&
      movingEnd <= existingEnd + TIMELINE_GAP_EPSILON) ||
    (existingClip.startTime >= movingClip.startTime - TIMELINE_GAP_EPSILON &&
      existingEnd <= movingEnd + TIMELINE_GAP_EPSILON)
  );
}

function createReachableStartCandidates(
  movingClip: VideoProjectClip,
  existingClip: VideoProjectClip
): number[] {
  const existingEnd = existingClip.startTime + existingClip.duration;
  return [
    existingClip.startTime - MIN_REACHABLE_CLIP_EDGE_SECONDS,
    existingEnd - movingClip.duration + MIN_REACHABLE_CLIP_EDGE_SECONDS,
    existingClip.startTime + MIN_REACHABLE_CLIP_EDGE_SECONDS,
    existingEnd - movingClip.duration - MIN_REACHABLE_CLIP_EDGE_SECONDS,
  ];
}
