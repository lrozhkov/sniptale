import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { getVideoProjectTrackLogicalLaneIdsThrough } from '../../../../features/video/project/timeline/logical-lanes';
import type { VideoProject } from '../../../../features/video/project/types/index';
import { isTrackCompatibleWithClip, resolveEditableClipOperation } from '../helpers';
import { createShiftedClipStartPatch } from './clip-shifts';
import { resolveReachableClipStartTime } from './reachable-placement';

export function moveProjectClip(
  project: VideoProject,
  clipId: string,
  startTime: number,
  trackId?: string,
  timelineLaneId?: string | null
): VideoProject {
  const operation = resolveEditableClipOperation(project, clipId);
  if (!operation || !isTargetTrackEditable(project, trackId, operation.clip)) {
    return project;
  }

  const nextStartTime = resolveReachableClipStartTime({
    operation,
    project,
    startTime: Math.max(0, startTime),
    ...(timelineLaneId !== undefined ? { timelineLaneId } : {}),
    ...(trackId !== undefined ? { trackId } : {}),
  });
  const nextTrackId = trackId ?? operation.clip.trackId;
  const clipPatch = createShiftedClipStartPatch({
    clipIds: operation.clipIdSet,
    delta: nextStartTime - operation.clip.startTime,
    project,
    updateClip: (clip, movedStartTime) => ({
      ...clip,
      startTime: movedStartTime,
      trackId: clip.id === clipId ? nextTrackId : clip.trackId,
      ...(clip.id === clipId && timelineLaneId !== undefined ? { timelineLaneId } : {}),
    }),
  });

  return applyVideoProjectMutationPatch(project, {
    ...clipPatch,
    ...(timelineLaneId === undefined
      ? {}
      : { tracks: ensureTargetTrackLogicalLanes(project, nextTrackId, timelineLaneId) }),
  });
}

function isTargetTrackEditable(
  project: VideoProject,
  trackId: string | undefined,
  clip: NonNullable<ReturnType<typeof resolveEditableClipOperation>>['clip']
): boolean {
  if (!trackId) {
    return true;
  }

  const targetTrack = project.tracks.find((track) => track.id === trackId);
  return Boolean(
    targetTrack && !targetTrack.locked && isTrackCompatibleWithClip(targetTrack, clip)
  );
}

function ensureTargetTrackLogicalLanes(
  project: VideoProject,
  trackId: string,
  timelineLaneId: string | null
): VideoProject['tracks'] {
  const logicalLaneIds = getVideoProjectTrackLogicalLaneIdsThrough(
    project,
    trackId,
    timelineLaneId
  );
  return project.tracks.map((track) =>
    track.id === trackId ? { ...track, logicalLanes: logicalLaneIds.map((id) => ({ id })) } : track
  );
}
