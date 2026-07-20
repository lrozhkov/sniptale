import { resolveClipLogicalLaneId } from '../timeline/logical-lanes';
import { canCreateTransitionBoundary } from './rules';
import { type VideoProject, type VideoProjectClip } from '../types/index';

export interface TrackJunction {
  duration: number;
  leadingClip: VideoProjectClip;
  overlapEnd: number;
  overlapStart: number;
  trailingClip: VideoProjectClip;
}

export function getClipEndTime(clip: VideoProjectClip): number {
  return clip.startTime + clip.duration;
}

function getTrackClips(project: VideoProject, trackId: string): VideoProjectClip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((left, right) => left.startTime - right.startTime || left.id.localeCompare(right.id));
}

export function getTrackJunctions(project: VideoProject): TrackJunction[] {
  return dedupeTrackJunctions(
    project.tracks.flatMap((track) => {
      const trackClips = getTrackClips(project, track.id);
      return [...groupTrackClipsByLogicalLane(trackClips).values()].flatMap(
        getLogicalLaneJunctions
      );
    })
  );
}

function dedupeTrackJunctions(junctions: TrackJunction[]): TrackJunction[] {
  const seenJunctions = new Set<string>();
  return junctions.filter((junction) => {
    const key = `${junction.leadingClip.id}:${junction.trailingClip.id}`;
    if (seenJunctions.has(key)) {
      return false;
    }
    seenJunctions.add(key);
    return true;
  });
}

function groupTrackClipsByLogicalLane(trackClips: readonly VideoProjectClip[]) {
  const clipsByLaneId = new Map<string, VideoProjectClip[]>();

  for (const clip of trackClips) {
    const laneId = resolveClipLogicalLaneId(clip);
    clipsByLaneId.set(laneId, [...(clipsByLaneId.get(laneId) ?? []), clip]);
  }

  return clipsByLaneId;
}

function getLogicalLaneJunctions(laneClips: VideoProjectClip[]): TrackJunction[] {
  const sortedClips = [...laneClips].sort(
    (left, right) => left.startTime - right.startTime || left.id.localeCompare(right.id)
  );

  return sortedClips.flatMap((leadingClip, index) => {
    const trailingClip = sortedClips[index + 1];
    if (!trailingClip) {
      return [];
    }

    return canCreateTransitionBoundary(leadingClip, trailingClip)
      ? [createTrackJunction(leadingClip, trailingClip)]
      : [];
  });
}

function createTrackJunction(
  leadingClip: VideoProjectClip,
  trailingClip: VideoProjectClip
): TrackJunction {
  const overlapStart = trailingClip.startTime;
  const overlapEnd = Math.min(getClipEndTime(leadingClip), getClipEndTime(trailingClip));
  return {
    duration: overlapEnd - overlapStart,
    leadingClip,
    overlapEnd,
    overlapStart,
    trailingClip,
  };
}
