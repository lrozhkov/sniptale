import {
  getVideoProjectTrackLogicalLaneIds,
  resolveClipLogicalLaneId,
} from '../timeline/logical-lanes';
import type { VideoProject } from '../types';

export function getEffectInsertionError(
  project: VideoProject,
  trackId: string,
  start: number,
  duration: number,
  timelineLaneId?: string | null
): 'effectTargetMissing' | 'effectTargetOccupied' | null {
  const track = project.tracks.find((track) => track.id === trackId);
  if (
    !track ||
    track.locked ||
    track.kind !== 'PRIMARY' ||
    track.role === 'CAMERA' ||
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return 'effectTargetMissing';
  const lane = resolveClipLogicalLaneId({ timelineLaneId: timelineLaneId ?? null });
  if (!getVideoProjectTrackLogicalLaneIds(project, trackId).includes(lane))
    return 'effectTargetMissing';
  return project.clips.some(
    (clip) =>
      clip.trackId === trackId &&
      resolveClipLogicalLaneId(clip) === lane &&
      clip.startTime < start + duration &&
      clip.startTime + clip.duration > start
  )
    ? 'effectTargetOccupied'
    : null;
}
