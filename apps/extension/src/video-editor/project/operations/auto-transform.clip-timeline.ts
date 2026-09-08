import type { VideoProject } from '../../../features/video/project/types';
import {
  VideoAutoProcessingAction,
  type VideoAutoProcessingAction as ProcessingAction,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  planSourceRangeCompression,
  planSourceRangeRemoval,
} from '../state/clip-timeline/source-range';

export interface AutoProcessingTarget {
  clipId: string;
  recordingId: string;
  sourceInstanceId: string;
}
export interface AutoProcessingTimingRequest {
  id: string;
  target: AutoProcessingTarget;
  sourceStart: number;
  sourceEnd: number;
  action: ProcessingAction;
  playbackRate: number;
}
export function planAutoProcessingInterval(
  project: VideoProject,
  item: AutoProcessingTimingRequest
) {
  const request = { ...item.target, sourceStart: item.sourceStart, sourceEnd: item.sourceEnd };
  return item.action === VideoAutoProcessingAction.REMOVE
    ? planSourceRangeRemoval(project, request)
    : item.action === VideoAutoProcessingAction.SKIP
      ? { status: 'unchanged' as const }
      : planSourceRangeCompression(project, { ...request, targetPlaybackRate: item.playbackRate });
}

/** Applies an explicitly reviewed set atomically through the single temporal owner. */
export function applyAutoProcessingTiming(
  project: VideoProject,
  items: readonly AutoProcessingTimingRequest[]
) {
  let candidate = project;
  const affected = new Set<string>();
  const shifted = new Set<string>();
  let removedDuration = 0;
  const ordered = [...items].sort(
    (left, right) =>
      left.target.clipId.localeCompare(right.target.clipId) || right.sourceStart - left.sourceStart
  );
  for (const item of ordered) {
    const result = planAutoProcessingInterval(candidate, item);
    if (result.status === 'blocked')
      return { status: 'blocked' as const, id: item.id, reason: result.reason };
    if (result.status === 'ready') {
      candidate = result.project;
      result.affectedClipIds.forEach((id) => affected.add(id));
      result.shiftedClipIds.forEach((id) => shifted.add(id));
      removedDuration += result.removedDuration;
    }
  }
  return {
    status: 'ready' as const,
    project: candidate,
    affectedClipIds: [...affected],
    shiftedClipIds: [...shifted],
    removedDuration,
  };
}
