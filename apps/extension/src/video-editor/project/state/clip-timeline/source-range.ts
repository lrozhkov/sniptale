import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type {
  VideoEditorTypingCompressionRequest,
  VideoEditorTypingSpanTarget,
} from '../../../contracts/commands/timeline';
import type { VideoProject, VideoProjectVideoClip } from '../../../../features/video/project/types';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { resolveClipLogicalLaneId } from '../../../../features/video/project/timeline';
import {
  isRecordingSourceTimedClip,
  isSourceTimedClip,
  updateSourceTimedClipTiming,
} from '../../operations/source-timed-clips';
import { reconcileProjectMutation, resolveEditableClipOperation } from '../helpers';
import { VIDEO_CLIP_PROPERTY_LIMITS } from '../clip-property/constraints';
import { splitProjectClipsAtTimeWithResult } from './split';
import { shiftProjectTrackTailBy } from './mutations';

interface SourceRangeCompressionRequest {
  clipId: string;
  recordingId: string;
  sourceInstanceId: string;
  sourceStart: number;
  sourceEnd: number;
  targetPlaybackRate: number;
}

type BlockedReason =
  | 'missing-source'
  | 'locked'
  | 'invalid-rate'
  | 'range-too-short'
  | 'linked-timing'
  | 'overlap';
type SourceRangeEditPlan =
  | { status: 'blocked'; reason: BlockedReason }
  | { status: 'unchanged' }
  | {
      status: 'ready';
      project: VideoProject;
      clipId: string | null;
      affectedClipIds: string[];
      shiftedClipIds: string[];
      previousDuration: number;
      nextDuration: number;
      removedDuration: number;
      projectDurationDelta: number;
    };

type SourceRangeCompressionPlan =
  | Exclude<SourceRangeEditPlan, { status: 'ready' }>
  | (Extract<SourceRangeEditPlan, { status: 'ready' }> & { clipId: string });
type SourceRangeRemovalRequest = Omit<SourceRangeCompressionRequest, 'targetPlaybackRate'>;

/** Accelerate a selected source interval with a single temporal owner. */
export function planSourceRangeCompression(
  project: VideoProject,
  request: SourceRangeCompressionRequest
): SourceRangeCompressionPlan {
  const result = planSourceRangeEdit(project, request, false);
  if (result.status !== 'ready') return result;
  return result.clipId
    ? { ...result, clipId: result.clipId }
    : { status: 'blocked', reason: 'missing-source' };
}

/** Remove a selected source interval using the same split and tail reconciliation. */
export function planSourceRangeRemoval(
  project: VideoProject,
  request: SourceRangeRemovalRequest
): SourceRangeEditPlan {
  return planSourceRangeEdit(project, { ...request, targetPlaybackRate: 1 }, true);
}

/** Resolve only the currently available captured signal and exact source placement. */
export function resolveTypingSpanSource(
  project: VideoProject,
  telemetry: readonly RecordingTelemetryEntry[],
  target: VideoEditorTypingSpanTarget
) {
  const clip = project.clips.find((item) => item.id === target.clipId);
  if (
    clip?.type !== 'VIDEO' ||
    clip.sourceInstanceId !== target.sourceInstanceId ||
    !isRecordingSourceTimedClip(project, clip, target.recordingId)
  )
    return null;
  const signal = telemetry
    .find((entry) => entry.recordingId === target.recordingId)
    ?.signals.find((item) => item.id === target.signalId && item.kind === 'typing');
  if (
    !signal ||
    signal.endTime <= clip.sourceStart ||
    signal.startTime >= clip.sourceStart + clip.sourceDuration
  )
    return null;
  return { clip, signal };
}

/** Preview and apply share both the captured-signal admission and the temporal transaction. */
export function planTypingCompression(
  project: VideoProject,
  telemetry: readonly RecordingTelemetryEntry[],
  request: VideoEditorTypingCompressionRequest
): SourceRangeCompressionPlan {
  const source = resolveTypingSpanSource(project, telemetry, request);
  if (!source) return { status: 'blocked', reason: 'missing-source' };
  return planSourceRangeCompression(project, {
    ...request,
    sourceStart: source.signal.startTime,
    sourceEnd: source.signal.endTime,
  });
}

const EPSILON = 0.000_001;

/** Plan and execute one immutable local compression; callers publish its snapshot once. */
function planSourceRangeEdit(
  project: VideoProject,
  request: SourceRangeCompressionRequest,
  remove: boolean
): SourceRangeEditPlan {
  const admission = admitSourceRangeEdit(project, request, remove);
  if (admission.status !== 'ready') return admission;
  const { clip, rate, targetRate, nextDuration, startTime, endTime } = admission;
  let nextProject = project;
  let middleClipId = clip.id;
  if (startTime > clip.startTime + EPSILON) {
    const split = splitProjectClipsAtTimeWithResult(nextProject, middleClipId, startTime);
    if (!split) return { status: 'blocked', reason: 'range-too-short' };
    nextProject = reconcileProjectMutation(
      nextProject,
      split.project,
      split.trailingClipIdsBySourceId
    );
    middleClipId = split.trailingClipId;
  }
  if (endTime < clip.startTime + clip.duration - EPSILON) {
    const split = splitProjectClipsAtTimeWithResult(nextProject, middleClipId, endTime);
    if (!split) return { status: 'blocked', reason: 'range-too-short' };
    nextProject = reconcileProjectMutation(
      nextProject,
      split.project,
      split.trailingClipIdsBySourceId
    );
  }
  const middle = resolveEditableClipOperation(nextProject, middleClipId);
  if (!middle) return { status: 'blocked', reason: 'locked' };
  if (
    middle.affectedClips.some(
      (item) =>
        item.startTime < startTime - EPSILON ||
        item.startTime + item.duration > endTime + EPSILON ||
        (!remove && (item.duration * rate) / targetRate < 1 / project.fps - EPSILON)
    )
  )
    return { status: 'blocked', reason: 'linked-timing' };
  const retimed = retimeSourceInterval(nextProject, {
    middle,
    startTime,
    rate,
    targetRate,
    remove,
  });
  nextProject = reconcileProjectMutation(nextProject, retimed);
  const previousDuration = endTime - startTime;
  const removedDuration = previousDuration - nextDuration;
  const shifted = shiftProjectTrackTailBy(nextProject, clip.trackId, endTime, -removedDuration);
  if ('reason' in shifted) return { status: 'blocked', reason: shifted.reason };
  nextProject = reconcileProjectMutation(nextProject, shifted.project);
  return {
    status: 'ready',
    project: nextProject,
    clipId: remove ? null : middleClipId,
    affectedClipIds: [...middle.clipIds],
    shiftedClipIds: shifted.clipIds,
    previousDuration,
    nextDuration,
    removedDuration,
    projectDurationDelta: project.duration - nextProject.duration,
  };
}

type EditableOperation = NonNullable<ReturnType<typeof resolveEditableClipOperation>>;

function isSourceIntervalObstructed(
  project: VideoProject,
  operation: EditableOperation,
  startTime: number,
  endTime: number
): boolean {
  // Cutting through a transition would silently rewrite the author's junction.
  if (
    (project.transitions ?? []).some(
      (transition) =>
        operation.clipIdSet.has(transition.leadingClipId) ||
        operation.clipIdSet.has(transition.trailingClipId)
    )
  )
    return true;
  if (
    operation.affectedClips.some((item) =>
      project.clips.some(
        (other) =>
          !operation.clipIdSet.has(other.id) &&
          item.trackId === other.trackId &&
          resolveClipLogicalLaneId(item) === resolveClipLogicalLaneId(other) &&
          Math.min(item.startTime + item.duration, other.startTime + other.duration, endTime) -
            Math.max(item.startTime, other.startTime, startTime) >
            EPSILON
      )
    )
  )
    return true;

  return false;
}

function retimeSourceInterval(
  project: VideoProject,
  {
    middle,
    startTime,
    rate,
    targetRate,
    remove,
  }: {
    middle: EditableOperation;
    startTime: number;
    rate: number;
    targetRate: number;
    remove: boolean;
  }
): VideoProject {
  return applyVideoProjectMutationPatch(project, {
    ...(project.effectInstances
      ? {
          effectInstances: project.effectInstances.flatMap((instance) => {
            if (instance.target.kind !== 'clip' || !middle.clipIdSet.has(instance.target.clipId))
              return [instance];
            if (remove) return [];
            const clockScale = rate / targetRate;
            return [
              {
                ...instance,
                startTime: startTime + (instance.startTime - startTime) * clockScale,
                duration: instance.duration * clockScale,
                playbackRate: instance.playbackRate / clockScale,
              },
            ];
          }),
        }
      : {}),
    clips: remove
      ? project.clips.filter((item) => !middle.clipIdSet.has(item.id))
      : project.clips.map((item) =>
          middle.clipIdSet.has(item.id) && isSourceTimedClip(item)
            ? updateSourceTimedClipTiming(item, {
                playbackRate: targetRate,
                startTime: startTime + ((item.startTime - startTime) * rate) / targetRate,
              })
            : item
        ),
  });
}

type SourceRangeAdmission =
  | Exclude<SourceRangeEditPlan, { status: 'ready' }>
  | {
      status: 'ready';
      clip: VideoProjectVideoClip;
      rate: number;
      targetRate: number;
      nextDuration: number;
      startTime: number;
      endTime: number;
    };

function admitSourceRangeEdit(
  project: VideoProject,
  request: SourceRangeCompressionRequest,
  remove: boolean
): SourceRangeAdmission {
  const clip = project.clips.find((item) => item.id === request.clipId);
  if (
    clip?.type !== 'VIDEO' ||
    clip.sourceInstanceId !== request.sourceInstanceId ||
    !isRecordingSourceTimedClip(project, clip, request.recordingId)
  )
    return { status: 'blocked', reason: 'missing-source' };
  const operation = resolveEditableClipOperation(project, clip.id);
  if (!operation) return { status: 'blocked', reason: 'locked' };
  const rate = clip.playbackRate ?? 1;
  const targetRate = request.targetPlaybackRate;
  if (
    !remove &&
    (!Number.isFinite(targetRate) ||
      targetRate < rate ||
      targetRate > VIDEO_CLIP_PROPERTY_LIMITS.playbackRate.max)
  )
    return { status: 'blocked', reason: 'invalid-rate' };
  if (!remove && targetRate === rate) return { status: 'unchanged' };
  const sourceStart = Math.max(clip.sourceStart, request.sourceStart);
  const sourceEnd = Math.min(clip.sourceStart + clip.sourceDuration, request.sourceEnd);
  const nextDuration = remove ? 0 : (sourceEnd - sourceStart) / targetRate;
  if (
    !Number.isFinite(sourceEnd - sourceStart) ||
    (sourceEnd - sourceStart) / (remove ? rate : targetRate) < 1 / project.fps - EPSILON
  )
    return { status: 'blocked', reason: 'range-too-short' };
  if (
    operation.affectedClips.some(
      (item) => !isSourceTimedClip(item) || Math.abs((item.playbackRate ?? 1) - rate) > EPSILON
    )
  )
    return { status: 'blocked', reason: 'linked-timing' };
  const startTime = clip.startTime + (sourceStart - clip.sourceStart) / rate;
  const endTime = clip.startTime + (sourceEnd - clip.sourceStart) / rate;
  if (isSourceIntervalObstructed(project, operation, startTime, endTime))
    return { status: 'blocked', reason: 'overlap' };

  return { status: 'ready', clip, rate, targetRate, nextDuration, startTime, endTime };
}
