import { mapScopedEffectIntervals } from '../../../../features/video/project/effect-instance/time-map';
import { getReachableClipTimingBounds } from './reachable-placement';
import { clampNumber } from '../../../../features/video/project/timeline/basics';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import {
  getLinkedClipIds,
  getTrackClips,
  resolveClipLogicalLaneId,
} from '../../../../features/video/project/timeline';
import {
  buildVideoEditorTrackGapCandidates,
  isMatchingTrackGapCandidate,
} from '../../operations/timeline-gaps';
import {
  normalizeClipPlaybackRate,
  getAssetById,
} from '../../../../features/video/project/timeline/basics';
import type { VideoProject } from '../../../../features/video/project/types/index';
import {
  areClipTracksEditable,
  isSourceTimedClip,
  resolveEditableClipOperation,
  updateSourceTimedClipTiming,
} from '../helpers';
import { createShiftedClipStartPatch } from './clip-shifts';
import { updateOperationClips } from './operation-updates';
export { moveProjectClip } from './move';
export { duplicateProjectClips, splitProjectClipsAtTime } from './split';

type EditableClipOperation = NonNullable<ReturnType<typeof resolveEditableClipOperation>>;
const TIMELINE_GAP_EPSILON = 0.0001;

/** Shift only the declared tail and its explicit links, preserving existing gaps. */
export function shiftProjectTrackTailBy(
  project: VideoProject,
  trackId: string,
  startTime: number,
  delta: number
): { project: VideoProject; clipIds: string[] } | { reason: 'locked' | 'overlap' } {
  const tail = getTrackClips(project, trackId).filter(
    (clip) => clip.startTime >= startTime - TIMELINE_GAP_EPSILON
  );
  const clipIds = collectLinkedClipIds(
    project,
    tail.map((clip) => clip.id)
  );
  if (!areClipTracksEditable(project, [...clipIds])) return { reason: 'locked' };
  if (clipIds.size === 0 || delta === 0) return { project, clipIds: [] };
  for (const clip of project.clips) {
    if (!clipIds.has(clip.id)) continue;
    const nextStart = clip.startTime + delta;
    if (nextStart < -TIMELINE_GAP_EPSILON) return { reason: 'overlap' };
    for (const neighbor of project.clips) {
      if (
        clipIds.has(neighbor.id) ||
        clip.trackId !== neighbor.trackId ||
        resolveClipLogicalLaneId(clip) !== resolveClipLogicalLaneId(neighbor)
      )
        continue;
      const overlap = (start: number) =>
        Math.max(
          0,
          Math.min(start + clip.duration, neighbor.startTime + neighbor.duration) -
            Math.max(start, neighbor.startTime)
        );
      if (overlap(nextStart) > overlap(clip.startTime) + TIMELINE_GAP_EPSILON)
        return { reason: 'overlap' };
    }
  }
  return {
    project: applyVideoProjectMutationPatch(
      project,
      createShiftedClipStartPatch({ clipIds, delta, project })
    ),
    clipIds: [...clipIds],
  };
}

export function closeProjectTrackGap(
  project: VideoProject,
  trackId: string,
  gapStart: number,
  gapEnd: number
): VideoProject {
  const gapDuration = gapEnd - gapStart;
  if (gapDuration <= TIMELINE_GAP_EPSILON || !isTrackEditable(project, trackId)) {
    return project;
  }

  const trailingClipIds = resolveTrailingGapClipIds(project, trackId, gapStart, gapEnd);
  if (trailingClipIds.length === 0) {
    return project;
  }

  const clipIdsToMove = collectLinkedClipIds(project, trailingClipIds);
  if (!areClipTracksEditable(project, [...clipIdsToMove])) {
    return project;
  }

  return applyVideoProjectMutationPatch(
    project,
    (() => {
      const patch = createShiftedClipStartPatch({
        clipIds: clipIdsToMove,
        delta: -gapDuration,
        project,
      });
      return {
        ...patch,
        ...(patch.effectInstances
          ? {
              effectInstances: mapScopedEffectIntervals(
                patch.effectInstances,
                new Set(
                  project.clips
                    .filter((clip) => clipIdsToMove.has(clip.id))
                    .map((clip) => clip.trackId)
                ),
                { start: gapStart, end: gapEnd, duration: 0 }
              ),
            }
          : {}),
      };
    })()
  );
}

function resolveTrailingGapClipIds(
  project: VideoProject,
  trackId: string,
  gapStart: number,
  gapEnd: number
): string[] {
  const matchingGap = buildVideoEditorTrackGapCandidates(project, trackId).find((candidate) =>
    isMatchingTrackGapCandidate(candidate, gapStart, gapEnd)
  );
  if (!matchingGap) {
    return [];
  }

  return getTrackClips(project, trackId)
    .filter((clip) => clip.startTime >= gapEnd - TIMELINE_GAP_EPSILON)
    .map((clip) => clip.id);
}

function collectLinkedClipIds(project: VideoProject, clipIds: string[]): Set<string> {
  const linkedClipIds = new Set<string>();
  for (const clipId of clipIds) {
    const operationIds = getLinkedClipIds(project, clipId);
    for (const operationId of operationIds.length > 0 ? operationIds : [clipId]) {
      linkedClipIds.add(operationId);
    }
  }

  return linkedClipIds;
}

function isTrackEditable(project: VideoProject, trackId: string): boolean {
  const track = project.tracks.find((item) => item.id === trackId);
  return Boolean(track && !track.locked);
}

function resolveClipEdgeOperation(project: VideoProject, clipId: string, edge: 'start' | 'end') {
  const operation = resolveEditableClipOperation(project, clipId);
  if (!operation) return null;
  const edgeTime = (clip: EditableClipOperation['clip']) =>
    edge === 'start' ? clip.startTime : clip.startTime + clip.duration;
  const time = edgeTime(operation.clip);
  const affectedClips = operation.affectedClips.filter(
    (clip) => Math.abs(edgeTime(clip) - time) < TIMELINE_GAP_EPSILON
  );
  return { ...operation, affectedClips, clipIdSet: new Set(affectedClips.map((clip) => clip.id)) };
}

export function trimProjectClipStart(
  project: VideoProject,
  clipId: string,
  nextStartTime: number
): VideoProject {
  const operation = resolveClipEdgeOperation(project, clipId, 'start');
  if (!operation) {
    return project;
  }

  if (!Number.isFinite(nextStartTime)) return project;
  const delta = clampClipTrimDelta(
    project,
    operation.affectedClips,
    'start',
    nextStartTime - operation.clip.startTime
  );
  if (delta === 0) return project;

  const nextProject = updateOperationClips(project, operation, (item) => {
    if (!isSourceTimedClip(item)) {
      return { ...item, startTime: item.startTime + delta, duration: item.duration - delta };
    }

    const sourceDelta = delta * normalizeClipPlaybackRate(item.playbackRate ?? 1);
    return updateSourceTimedClipTiming(item, {
      startTime: item.startTime + delta,
      sourceStart: item.sourceStart + sourceDelta,
      sourceDuration: item.sourceDuration - sourceDelta,
    });
  });
  return nextProject;
}

/** Share nearest-neighbor and authored-overlap bounds with playback-rate edits. */
function getTrimJunctionBounds(
  project: VideoProject,
  clips: EditableClipOperation['affectedClips'],
  edge: 'start' | 'end'
) {
  let minimum = -Infinity;
  let maximum = Infinity;
  const affectedIds = new Set(clips.map((clip) => clip.id));
  for (const clip of clips) {
    const bounds = getReachableClipTimingBounds(project, clip, affectedIds);
    const currentEdge = clip.startTime + (edge === 'end' ? clip.duration : 0);
    minimum = Math.max(
      minimum,
      (edge === 'start' ? bounds.minimumStart : bounds.minimumEnd) - currentEdge
    );
    maximum = Math.min(
      maximum,
      (edge === 'start' ? bounds.maximumStart : bounds.maximumEnd) - currentEdge
    );
  }
  return { minimum, maximum };
}

/** One shared feasible delta keeps aligned linked edges and their source bounds together. */
function clampClipTrimDelta(
  project: VideoProject,
  clips: EditableClipOperation['affectedClips'],
  edge: 'start' | 'end',
  requestedDelta: number
): number {
  if (requestedDelta === 0) return 0;
  let { minimum, maximum } = getTrimJunctionBounds(project, clips, edge);
  for (const clip of clips) {
    const sourceTimed = isSourceTimedClip(clip);
    const rate = sourceTimed ? normalizeClipPlaybackRate(clip.playbackRate ?? 1) : 1;
    const minimumDuration = 1 / project.fps;
    if (edge === 'start') {
      minimum = Math.max(minimum, -clip.startTime);
      maximum = Math.min(maximum, clip.duration - minimumDuration);
    } else {
      minimum = Math.max(minimum, minimumDuration - clip.duration);
    }
    if (!sourceTimed) continue;
    if (edge === 'start') {
      minimum = Math.max(minimum, -clip.sourceStart / rate);
    } else {
      const assetDuration =
        getAssetById(project, clip.assetId)?.metadata.duration ??
        clip.sourceStart + clip.sourceDuration;
      maximum = Math.min(maximum, (assetDuration - clip.sourceStart - clip.sourceDuration) / rate);
    }
  }
  if (minimum > maximum) return 0;
  const delta = clampNumber(requestedDelta, minimum, maximum);
  return delta * requestedDelta < 0 ? 0 : delta;
}

export function trimProjectClipEnd(
  project: VideoProject,
  clipId: string,
  nextEndTime: number
): VideoProject {
  const operation = resolveClipEdgeOperation(project, clipId, 'end');
  if (!operation) {
    return project;
  }

  if (!Number.isFinite(nextEndTime)) return project;
  const currentEnd = operation.clip.startTime + operation.clip.duration;
  const deltaDuration = clampClipTrimDelta(
    project,
    operation.affectedClips,
    'end',
    nextEndTime - currentEnd
  );
  if (deltaDuration === 0) return project;

  const nextProject = updateOperationClips(project, operation, (item) => {
    if (!isSourceTimedClip(item)) {
      return { ...item, duration: item.duration + deltaDuration };
    }

    return updateSourceTimedClipTiming(item, {
      sourceDuration:
        item.sourceDuration + deltaDuration * normalizeClipPlaybackRate(item.playbackRate ?? 1),
    });
  });
  return nextProject;
}
