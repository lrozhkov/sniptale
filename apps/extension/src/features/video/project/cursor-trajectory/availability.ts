import { resolveProjectCursorFocusPath } from '../cursor-focus-path/projection';
import type { CursorFocusSegment } from '../cursor-focus-path/types';
import { getClipSourceObservationTime, mapSourceTimeToProjectPoint } from '../timeline/source-time';
import type { VideoProject, VideoProjectMotionRegion, VideoProjectVideoClip } from '../types';
import { evaluateCursorTrajectory } from './evaluate';
import type { ReadCursorTrajectoryWindow } from './project-window';

function sourceInterval(clip: VideoProjectVideoClip, start: number, end: number) {
  const from = getClipSourceObservationTime(clip, start);
  const to = getClipSourceObservationTime(clip, end);
  if (from === undefined || to === undefined || !Number.isFinite(from) || !Number.isFinite(to))
    return null;
  const firstEnd = clip.playbackWindow ? mapSourceTimeToProjectPoint([clip], to, clip.id) : null;
  // The inverse gives the first visit to a held point, not its whole retained plateau.
  const includesEnd =
    !!clip.playbackWindow &&
    (from === to || (firstEnd !== null && Math.round(firstEnd.time * 1e6) < Math.round(end * 1e6)));
  return { from, to, fromUs: Math.round(from * 1e6), toUs: Math.round(to * 1e6), includesEnd };
}

function segmentIntersects(
  segment: CursorFocusSegment,
  from: number,
  to: number,
  includesEnd = false
) {
  return (
    segment.keys.length > 0 &&
    segment.end >= from &&
    (includesEnd ? segment.start <= to : segment.start < to)
  );
}

async function archiveAvailable(
  group: NonNullable<NonNullable<VideoProject['cursorTrack']>['sourceObservations']>[number],
  range: NonNullable<ReturnType<typeof sourceInterval>>,
  read: ReadCursorTrajectoryWindow,
  signal?: AbortSignal
) {
  const descriptor = group.trajectory;
  if (
    !descriptor ||
    descriptor.totalBlocks === 0 ||
    range.fromUs < 0 ||
    range.toUs < range.fromUs ||
    (range.toUs === range.fromUs && !range.includesEnd)
  )
    return false;
  const inRange = (time: number) =>
    time >= range.fromUs && (range.includesEnd ? time <= range.toUs : time < range.toUs);
  let active = range.fromUs;
  while (inRange(active)) {
    signal?.throwIfAborted();
    const window = await read(
      { recordingId: group.recordingId, trajectoryId: descriptor.trajectoryId },
      descriptor,
      active
    );
    signal?.throwIfAborted();
    if (!window) return false;
    const covered = (time: number) =>
      time >= window.fromTimeUs && (window.toTimeUs === null || time < window.toTimeUs);
    if (covered(active) && evaluateCursorTrajectory(window.records, active, window.initialSegment))
      return true;
    for (const record of window.records) {
      if (
        record.kind !== 'sample' ||
        !record.observed ||
        !record.visible ||
        record.xQ8 === null ||
        record.yQ8 === null ||
        !inRange(record.activeTimeUs) ||
        !covered(record.activeTimeUs)
      )
        continue;
      if (evaluateCursorTrajectory(window.records, record.activeTimeUs, window.initialSegment))
        return true;
    }
    const next = window.toTimeUs;
    if (next === null || next <= active) return false;
    active = next;
  }
  return false;
}

/** Checks one selected interval without copying archived observations into the authored project. */
export async function motionRegionHasAvailableCursor(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  read: ReadCursorTrajectoryWindow,
  signal?: AbortSignal
): Promise<boolean> {
  signal?.throwIfAborted();
  const start = region.startTime;
  const end = start + region.duration;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const bound = region.sourceBinding?.clipId;
  const clips = project.clips.filter(
    (clip): clip is VideoProjectVideoClip =>
      clip.type === 'VIDEO' &&
      (!bound || clip.id === bound) &&
      clip.startTime < end &&
      clip.startTime + clip.duration > start
  );
  if (bound && clips.length === 0) return false;
  const path = resolveProjectCursorFocusPath(project);
  if (
    !bound &&
    path.segments.some(
      (segment) => segment.binding.kind === 'project' && segmentIntersects(segment, start, end)
    )
  )
    return true;
  for (const clip of clips) {
    signal?.throwIfAborted();
    const clipStart = Math.max(start, clip.startTime);
    const clipEnd = Math.min(end, clip.startTime + clip.duration);
    if (
      path.segments.some(
        (segment) =>
          segment.binding.kind === 'project' && segmentIntersects(segment, clipStart, clipEnd)
      )
    )
      return true;
    const range = sourceInterval(clip, clipStart, clipEnd);
    if (!range) continue;
    if (
      path.segments.some(
        (segment) =>
          segment.binding.kind === 'recording-source' &&
          segment.binding.sourceInstanceId === (clip.sourceInstanceId ?? clip.id) &&
          segmentIntersects(segment, range.from, range.to, range.includesEnd)
      )
    )
      return true;
    const group = project.cursorTrack?.sourceObservations?.find(
      (item) => item.sourceInstanceId === clip.sourceInstanceId
    );
    if (group && (await archiveAvailable(group, range, read, signal))) return true;
  }
  return false;
}
