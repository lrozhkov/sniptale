import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import {
  applyTimelinePlacementPolicy,
  getClipEndTime,
  resolveClipLogicalLaneId,
} from '../../../features/video/project/timeline';
import { normalizeVideoProjectClipLogicalLaneId } from '../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectAsset,
  VideoProjectClip,
} from '../../../features/video/project/types/index';

export type AddAssetClipResult = {
  project: VideoProject;
  selectedClipId: string | null;
  selectedTrackId: string | null;
};

function ensureProjectAssetList(
  project: VideoProject,
  asset: VideoProjectAsset
): VideoProjectAsset[] {
  return project.assets.some((item) => item.id === asset.id)
    ? project.assets
    : [...project.assets, asset];
}

function clipsOverlap(left: VideoProjectClip, right: VideoProjectClip): boolean {
  return (
    left.startTime < getClipEndTime(right) - 0.0001 &&
    right.startTime < getClipEndTime(left) - 0.0001
  );
}

export function assignClipTimelineLane<TClip extends VideoProjectClip>(
  clip: TClip,
  timelineLaneId?: string | null
): TClip {
  const normalizedLaneId = normalizeVideoProjectClipLogicalLaneId(timelineLaneId);
  return normalizedLaneId ? ({ ...clip, timelineLaneId: normalizedLaneId } as TClip) : clip;
}

function clipsShareTimelineLane(left: VideoProjectClip, right: VideoProjectClip): boolean {
  return (
    left.trackId === right.trackId &&
    resolveClipLogicalLaneId(left) === resolveClipLogicalLaneId(right)
  );
}

function hasTrackOccupancyConflict(project: VideoProject, clip: VideoProjectClip): boolean {
  return project.clips.some((existingClip) => {
    if (!clipsShareTimelineLane(existingClip, clip)) {
      return false;
    }

    return clipsOverlap(existingClip, clip);
  });
}

function resolveTrackLaneEndTime(project: VideoProject, clip: VideoProjectClip): number {
  return project.clips
    .filter((existingClip) => clipsShareTimelineLane(existingClip, clip))
    .reduce((maxEnd, existingClip) => Math.max(maxEnd, getClipEndTime(existingClip)), 0);
}

function resolveInsertedClipPlacements(
  project: VideoProject,
  clips: VideoProjectClip[]
): VideoProjectClip[] {
  if (!clips.some((clip) => hasTrackOccupancyConflict(project, clip))) {
    return clips;
  }

  const earliestStartTime = clips.reduce(
    (minStart, clip) => Math.min(minStart, clip.startTime),
    Number.POSITIVE_INFINITY
  );
  const fallbackStartTime = clips.reduce(
    (maxEnd, clip) => Math.max(maxEnd, resolveTrackLaneEndTime(project, clip)),
    0
  );
  const shiftDelta = Math.max(0, fallbackStartTime - earliestStartTime);

  if (shiftDelta <= 0.0001) {
    return clips;
  }

  return clips.map((clip) => ({
    ...clip,
    startTime: clip.startTime + shiftDelta,
  }));
}

export function buildInsertedClipResult(params: {
  asset?: VideoProjectAsset;
  project: VideoProject;
  clips: VideoProjectClip[];
  selectedClipId: string | null;
  selectedTrackId: string | null;
}): AddAssetClipResult {
  const insertedClips = resolveInsertedClipPlacements(params.project, params.clips);
  const patch = params.asset
    ? {
        assets: ensureProjectAssetList(params.project, params.asset),
        clips: [...params.project.clips, ...insertedClips],
      }
    : { clips: [...params.project.clips, ...insertedClips] };

  return {
    project: applyTimelinePlacementPolicy(
      applyVideoProjectMutationPatch(params.project, patch),
      insertedClips.map((clip) => clip.id)
    ),
    selectedClipId: params.selectedClipId,
    selectedTrackId: params.selectedTrackId,
  };
}
