import { syncProjectDuration } from '../../../features/video/project/timeline';
import { normalizeClipPlaybackRate } from '../../../features/video/project/timeline/basics';
import type { VideoProject } from '../../../features/video/project/types/model';
import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import type { AutoTransformCandidate } from './auto-transform.candidates';
import {
  AUTO_TRANSFORM_SOURCE_EPSILON,
  cloneSourceTimedClip,
  collectSourceUnits,
  getSourceEnd,
  getSourceUnitKey,
  isRecordingSourceTimedClip,
  splitUnitsAtSourceTime,
  type SourceTimedClip,
} from './auto-transform.clip-units';

function applyRates(
  project: VideoProject,
  recordingId: string,
  candidates: AutoTransformCandidate[]
) {
  const speedCandidates = candidates.filter(
    (candidate) => candidate.action === VideoAutoProcessingAction.SPEED_UP
  );

  return {
    ...project,
    clips: project.clips.map((clip) => {
      if (!isRecordingSourceTimedClip(project, clip, recordingId)) {
        return clip;
      }

      const candidate = speedCandidates.find(
        (item) =>
          clip.sourceStart >= item.startTime - AUTO_TRANSFORM_SOURCE_EPSILON &&
          getSourceEnd(clip) <= item.endTime + AUTO_TRANSFORM_SOURCE_EPSILON
      );

      return candidate
        ? cloneSourceTimedClip(clip, { playbackRate: candidate.playbackRate })
        : clip;
    }),
  };
}

function isClipInRemovedRange(
  clip: SourceTimedClip,
  candidates: AutoTransformCandidate[]
): boolean {
  return candidates.some(
    (candidate) =>
      candidate.action === VideoAutoProcessingAction.REMOVE &&
      clip.sourceStart >= candidate.startTime - AUTO_TRANSFORM_SOURCE_EPSILON &&
      getSourceEnd(clip) <= candidate.endTime + AUTO_TRANSFORM_SOURCE_EPSILON
  );
}

function removeCandidateRanges(
  project: VideoProject,
  recordingId: string,
  candidates: AutoTransformCandidate[]
) {
  return {
    ...project,
    clips: project.clips.filter(
      (clip) =>
        !isRecordingSourceTimedClip(project, clip, recordingId) ||
        !isClipInRemovedRange(clip, candidates)
    ),
  };
}

function compactTimeline(project: VideoProject, recordingId: string) {
  const startTimes = new Map<string, number>();
  let cursor = 0;

  for (const unit of collectSourceUnits(project, recordingId)) {
    const representative = unit[0];
    if (!representative) {
      continue;
    }

    startTimes.set(getSourceUnitKey(representative), cursor);
    cursor += representative.duration;
  }

  return {
    ...project,
    clips: project.clips.map((clip) => {
      if (!isRecordingSourceTimedClip(project, clip, recordingId)) {
        return clip;
      }

      const startTime = startTimes.get(getSourceUnitKey(clip));
      return startTime === undefined ? clip : { ...clip, startTime };
    }),
  };
}

function findClipBySourceTime(project: VideoProject, recordingId: string, sourceTime: number) {
  for (const clip of collectSourceUnits(project, recordingId).flat()) {
    if (
      sourceTime >= clip.sourceStart - AUTO_TRANSFORM_SOURCE_EPSILON &&
      sourceTime <= getSourceEnd(clip) + AUTO_TRANSFORM_SOURCE_EPSILON
    ) {
      return clip;
    }
  }

  return null;
}

export function applyAutoTransformClipTimeline(
  project: VideoProject,
  recordingId: string,
  candidates: AutoTransformCandidate[]
): VideoProject {
  let nextProject = project;

  for (const candidate of candidates) {
    nextProject = splitUnitsAtSourceTime(nextProject, recordingId, candidate.startTime);
    nextProject = splitUnitsAtSourceTime(nextProject, recordingId, candidate.endTime);
  }

  return syncProjectDuration(
    compactTimeline(
      applyRates(
        removeCandidateRanges(nextProject, recordingId, candidates),
        recordingId,
        candidates
      ),
      recordingId
    )
  );
}

export function mapSourceTimeToProjectTime(
  project: VideoProject,
  recordingId: string,
  sourceTime: number
): number | null {
  const clip = findClipBySourceTime(project, recordingId, sourceTime);
  if (!clip) {
    return null;
  }

  const sourceOffset = Math.min(Math.max(0, sourceTime - clip.sourceStart), clip.sourceDuration);
  return clip.startTime + sourceOffset / normalizeClipPlaybackRate(clip.playbackRate ?? 1);
}
