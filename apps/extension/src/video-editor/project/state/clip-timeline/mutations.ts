import { getTrackJunctions } from '../../../../features/video/project/transition/junctions';
import { clampNumber } from '../../../../features/video/project/timeline/basics';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { getLinkedClipIds, getTrackClips } from '../../../../features/video/project/timeline';
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
    createShiftedClipStartPatch({ clipIds: clipIdsToMove, delta: -gapDuration, project })
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

/** Preserve the ordering of existing overlaps without moving an untouched neighbor. */
function getTrimJunctionBounds(
  project: VideoProject,
  clips: EditableClipOperation['affectedClips'],
  edge: 'start' | 'end'
) {
  let minimum = -Infinity;
  let maximum = Infinity;
  const affectedIds = new Set(clips.map((clip) => clip.id));
  for (const { leadingClip, trailingClip } of getTrackJunctions(project)) {
    const leadingMoves = affectedIds.has(leadingClip.id);
    const trailingMoves = affectedIds.has(trailingClip.id);
    if (leadingMoves === trailingMoves) continue;
    const leadingEdge = leadingClip.startTime + (edge === 'end' ? leadingClip.duration : 0);
    const trailingEdge = trailingClip.startTime + (edge === 'end' ? trailingClip.duration : 0);
    const availableDelta = Math.max(0, trailingEdge - leadingEdge - 0.1);
    if (leadingMoves) maximum = Math.min(maximum, availableDelta);
    else minimum = Math.max(minimum, -availableDelta);
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
