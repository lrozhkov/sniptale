import { clampTimelineScale } from '../../../contracts/timeline-scale';
import { getClipEndTime } from '../../../../features/video/project/timeline';
import type { VideoProject } from '../../../../features/video/project/types';

const TIMELINE_MAGNET_THRESHOLD_PX = 8;

interface TimelineSnapResult {
  targetTime: number | null;
  time: number;
}

interface TimelineSnapOptions {
  additionalTimes?: number[];
  excludedClipId?: string;
  includeMotionRegions?: boolean;
}

export function snapTimelineTime(
  time: number,
  project: VideoProject,
  pixelsPerSecond: number,
  options: TimelineSnapOptions = {}
): number {
  return resolveTimelineSnap(time, project, pixelsPerSecond, options).time;
}

export function resolveTimelineSnap(
  time: number,
  project: VideoProject,
  pixelsPerSecond: number,
  options: TimelineSnapOptions = {}
): TimelineSnapResult {
  const threshold = TIMELINE_MAGNET_THRESHOLD_PX / clampTimelineScale(pixelsPerSecond);
  const candidate = getTimelineMagnetTimes(project, options).reduce<{
    distance: number;
    time: number;
  } | null>((best, targetTime) => {
    const distance = Math.abs(targetTime - time);
    return distance <= threshold && (!best || distance < best.distance)
      ? { distance, time: targetTime }
      : best;
  }, null);
  return candidate
    ? { targetTime: candidate.time, time: candidate.time }
    : { targetTime: null, time };
}

function getTimelineMagnetTimes(project: VideoProject, options: TimelineSnapOptions): number[] {
  return [
    0,
    project.duration,
    ...(options.additionalTimes ?? []),
    ...project.clips
      .filter((clip) => clip.id !== options.excludedClipId)
      .flatMap((clip) => [clip.startTime, getClipEndTime(clip)]),
    ...(options.includeMotionRegions === false
      ? []
      : (project.motionRegions ?? [])
          .filter((region) => region.duration > 0)
          .flatMap((region) => [region.startTime, region.startTime + region.duration])),
  ];
}
