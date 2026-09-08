import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { getLinkedClipIds } from '../../../../features/video/project/timeline/basics';
import type { VideoProject } from '../../../../features/video/project/types';
import { getMotionAnimationTime } from '../../../../features/video/project/motion/timing';
import { isVideoProjectUtilityLaneLocked } from '../../../../features/video/project/utility-lanes';
import { createShiftedClipStartPatch } from '../clip-timeline/clip-shifts';
import { splitProjectClipsAtTimeWithResult } from '../clip-timeline/split';

type MaterialInsertRoomResult =
  | {
      status: 'ready';
      project: VideoProject;
      trailingClipIdsBySourceId: ReadonlyMap<string, string>;
    }
  | { status: 'rejected'; reason: 'locked-track' | 'invalid-cut' };

/** Opens a montage interval before the material is committed by the placement transaction. */
export function makeRoomForMaterial(
  project: VideoProject,
  time: number,
  duration: number
): MaterialInsertRoomResult {
  if (!Number.isFinite(time) || time < 0 || !Number.isFinite(duration) || duration <= 0) {
    return { status: 'rejected', reason: 'invalid-cut' };
  }
  if (
    isVideoProjectUtilityLaneLocked(project, 'camera') &&
    project.motionRegions?.some((region) => region.startTime + region.duration > time)
  ) {
    return { status: 'rejected', reason: 'locked-track' };
  }
  const affectedIds = new Set(
    project.clips
      .filter((clip) => clip.startTime + clip.duration > time)
      .flatMap((clip) => getLinkedClipIds(project, clip.id))
  );
  if (
    project.clips.some(
      (clip) =>
        affectedIds.has(clip.id) && project.tracks.find(({ id }) => id === clip.trackId)?.locked
    )
  ) {
    return { status: 'rejected', reason: 'locked-track' };
  }
  let divided = project;
  const trailingClipIdsBySourceId = new Map<string, string>();
  for (const original of project.clips) {
    const clip = divided.clips.find(({ id }) => id === original.id);
    if (!clip || clip.startTime >= time || clip.startTime + clip.duration <= time) continue;
    const result = splitProjectClipsAtTimeWithResult(divided, clip.id, time);
    if (!result) return { status: 'rejected', reason: 'invalid-cut' };
    for (const [sourceId, trailingId] of result.trailingClipIdsBySourceId) {
      trailingClipIdsBySourceId.set(sourceId, trailingId);
    }
    divided = result.project;
  }
  const tailIds = new Set(
    divided.clips.filter(({ startTime }) => startTime >= time).map(({ id }) => id)
  );
  return {
    status: 'ready',
    trailingClipIdsBySourceId,
    project: applyVideoProjectMutationPatch(divided, {
      ...createShiftedClipStartPatch({ project: divided, clipIds: tailIds, delta: duration }),
      ...(project.motionRegions
        ? { motionRegions: insertMotionGap(project.motionRegions, time, duration) }
        : {}),
    }),
  };
}

function insertMotionGap(
  regions: NonNullable<VideoProject['motionRegions']>,
  time: number,
  duration: number
) {
  return regions.flatMap((region) => {
    if (region.sourceBinding) return [region];
    if (region.startTime + region.duration <= time) return [region];
    if (region.startTime >= time) return [{ ...region, startTime: region.startTime + duration }];
    const offset = time - region.startTime;
    const split = getMotionAnimationTime(region, offset);
    const animation = region.animation ?? {
      start: 0,
      end: region.duration,
      duration: region.duration,
    };
    return [
      { ...region, duration: offset, animation: { ...animation, end: split } },
      {
        ...region,
        id: crypto.randomUUID(),
        startTime: time + duration,
        duration: region.duration - offset,
        animation: { ...animation, start: split },
      },
    ];
  });
}
