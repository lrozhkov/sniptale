import type { VideoProject, VideoProjectMotionRegion } from '../types';
import { resolveMotionConnectionSource } from './index';

type MotionRange = Pick<VideoProjectMotionRegion, 'startTime' | 'duration'>;
const MIN_DURATION = 0.1;

function occupiedRanges(project: VideoProject, movingId?: string): MotionRange[] {
  return (project.motionRegions ?? []).flatMap((region) => {
    if (region.duration <= 0) return [];
    const ranges: MotionRange[] = region.id === movingId ? [] : [region];
    const source = resolveMotionConnectionSource(project, region);
    if (source && region.id !== movingId && source.id !== movingId) {
      ranges.push({
        startTime: source.startTime + source.duration,
        duration: region.startTime - source.startTime - source.duration,
      });
    }
    return ranges;
  });
}

/** A zoom starts at the playhead and fits the free half-open interval following it. */
export function getMotionInsertionRange(project: VideoProject, time: number): MotionRange | null {
  if (!Number.isFinite(time) || time < 0 || time >= project.duration) return null;
  let end = project.duration;
  for (const range of occupiedRanges(project)) {
    if (time >= range.startTime && time < range.startTime + range.duration) return null;
    if (range.startTime > time) end = Math.min(end, range.startTime);
  }
  return end - time >= MIN_DURATION ? { startTime: time, duration: end - time } : null;
}

/** Clamp drafts and commits to neighbours without crossing an intervening zoom or connection. */
export function constrainMotionTiming(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  requested: MotionRange,
  move: boolean
): MotionRange {
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  let start = clip ? clip.startTime : 0;
  let end = clip ? clip.startTime + clip.duration : project.duration;
  for (const range of occupiedRanges(project, region.id)) {
    if (range.startTime + range.duration <= region.startTime) {
      start = Math.max(start, range.startTime + range.duration);
    } else if (range.startTime >= region.startTime + region.duration) {
      end = Math.min(end, range.startTime);
    }
  }
  if (end - start < MIN_DURATION) return { startTime: region.startTime, duration: region.duration };
  const requestedStart = Number.isFinite(requested.startTime)
    ? requested.startTime
    : region.startTime;
  if (move) {
    return {
      startTime: Math.max(start, Math.min(Math.max(start, end - region.duration), requestedStart)),
      duration: region.duration,
    };
  }
  const requestedEnd =
    requestedStart + (Number.isFinite(requested.duration) ? requested.duration : region.duration);
  const nextStart = Math.max(start, Math.min(end - MIN_DURATION, requestedStart));
  const nextEnd = Math.max(nextStart + MIN_DURATION, Math.min(end, requestedEnd));
  return { startTime: nextStart, duration: nextEnd - nextStart };
}
