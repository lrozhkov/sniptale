import { clampNumber } from '../../../../features/video/project/timeline/basics';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { getLinkedClipIds, getTrackClips } from '../../../../features/video/project/timeline';
import {
  buildVideoEditorTrackGapCandidates,
  isMatchingTrackGapCandidate,
} from '../../operations/timeline-gaps';
import {
  getSourceTimedClipSourceOffset,
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

export function trimProjectClipStart(
  project: VideoProject,
  clipId: string,
  nextStartTime: number
): VideoProject {
  const operation = resolveEditableClipOperation(project, clipId);
  if (!operation) {
    return project;
  }

  const clipEnd = operation.clip.startTime + operation.clip.duration;
  const clampedStart = clampNumber(nextStartTime, 0, clipEnd - 0.1);
  const delta = clampedStart - operation.clip.startTime;
  if (
    operation.affectedClips.some((item) => {
      if (!isSourceTimedClip(item)) {
        return item.duration - delta < 0.1;
      }

      return item.sourceDuration - getSourceTimedClipSourceOffset(item, delta) < 0.1;
    })
  ) {
    return project;
  }

  const nextProject = updateOperationClips(project, operation, (item) => {
    if (!isSourceTimedClip(item)) {
      return { ...item, startTime: item.startTime + delta, duration: item.duration - delta };
    }

    const sourceDelta = getSourceTimedClipSourceOffset(item, delta);
    return updateSourceTimedClipTiming(item, {
      startTime: item.startTime + delta,
      sourceStart: item.sourceStart + sourceDelta,
      sourceDuration: item.sourceDuration - sourceDelta,
    });
  });
  return nextProject;
}

function hasInvalidClipEndTrim(
  affectedClips: EditableClipOperation['affectedClips'],
  deltaDuration: number
): boolean {
  return affectedClips.some((item) => {
    if (!isSourceTimedClip(item)) {
      return item.duration + deltaDuration < 0.1;
    }

    return item.sourceDuration + getSourceTimedClipSourceOffset(item, deltaDuration) < 0.1;
  });
}

function exceedsSourceAssetDuration(
  project: VideoProject,
  affectedClips: EditableClipOperation['affectedClips'],
  deltaDuration: number
): boolean {
  return affectedClips.some((item) => {
    if (!isSourceTimedClip(item)) {
      return false;
    }

    const assetDuration =
      getAssetById(project, item.assetId)?.metadata.duration ??
      item.sourceStart + item.sourceDuration;
    const sourceDelta = getSourceTimedClipSourceOffset(item, deltaDuration);
    return item.sourceStart + item.sourceDuration + sourceDelta > assetDuration + 0.0001;
  });
}

export function trimProjectClipEnd(
  project: VideoProject,
  clipId: string,
  nextEndTime: number
): VideoProject {
  const operation = resolveEditableClipOperation(project, clipId);
  if (!operation) {
    return project;
  }

  const currentEnd = operation.clip.startTime + operation.clip.duration;
  const clampedEnd = clampNumber(
    nextEndTime,
    operation.clip.startTime + 0.1,
    Number.MAX_SAFE_INTEGER
  );
  const deltaDuration = clampedEnd - currentEnd;
  if (hasInvalidClipEndTrim(operation.affectedClips, deltaDuration)) {
    return project;
  }
  if (exceedsSourceAssetDuration(project, operation.affectedClips, deltaDuration)) {
    return project;
  }

  const nextProject = updateOperationClips(project, operation, (item) => {
    if (!isSourceTimedClip(item)) {
      return { ...item, duration: item.duration + deltaDuration };
    }

    return updateSourceTimedClipTiming(item, {
      sourceDuration: item.sourceDuration + getSourceTimedClipSourceOffset(item, deltaDuration),
    });
  });
  return nextProject;
}
