import { getClipEndTime } from '../../../../features/video/project/timeline';
import type { VideoProject } from '../../../../features/video/project/types';

const TIMELINE_MAGNET_THRESHOLD_PX = 8;

export function snapTimelineTime(
  time: number,
  project: VideoProject,
  pixelsPerSecond: number
): number {
  const threshold = TIMELINE_MAGNET_THRESHOLD_PX / Math.max(1, pixelsPerSecond);
  const candidate = getTimelineMagnetTimes(project).reduce<{
    distance: number;
    time: number;
  } | null>((best, targetTime) => {
    const distance = Math.abs(targetTime - time);
    return distance <= threshold && (!best || distance < best.distance)
      ? { distance, time: targetTime }
      : best;
  }, null);
  return candidate?.time ?? time;
}

function getTimelineMagnetTimes(project: VideoProject): number[] {
  return [
    0,
    project.duration,
    ...project.clips.flatMap((clip) => [clip.startTime, getClipEndTime(clip)]),
    ...(project.motionRegions ?? []).flatMap((region) => [
      region.startTime,
      region.startTime + region.duration,
    ]),
  ];
}
