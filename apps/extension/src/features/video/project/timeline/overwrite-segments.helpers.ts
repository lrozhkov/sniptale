import { getClipEndTime, isAudioClip, isVideoClip } from './basics';
import { VideoClipLinkMode, type VideoProjectClip } from '../types/index';

export interface ClipTimeRange {
  start: number;
  end: number;
}

export function mergeClipTimeRanges(ranges: ClipTimeRange[]): ClipTimeRange[] {
  if (ranges.length <= 1) {
    return ranges;
  }

  const sorted = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  const firstRange = sorted[0];
  if (!firstRange) {
    return [];
  }

  const merged: ClipTimeRange[] = [{ ...firstRange }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];
    if (!current || !previous) {
      continue;
    }

    if (current.start <= previous.end + 0.0001) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

function subtractClipTimeRanges(target: ClipTimeRange, removals: ClipTimeRange[]): ClipTimeRange[] {
  if (removals.length === 0) {
    return [target];
  }

  const remaining: ClipTimeRange[] = [];
  let cursor = target.start;
  for (const removal of mergeClipTimeRanges(removals)) {
    if (removal.end <= cursor || removal.start >= target.end) {
      continue;
    }

    if (removal.start > cursor) {
      remaining.push({
        start: cursor,
        end: Math.min(removal.start, target.end),
      });
    }

    cursor = Math.max(cursor, removal.end);
    if (cursor >= target.end) {
      break;
    }
  }

  if (cursor < target.end) {
    remaining.push({ start: cursor, end: target.end });
  }

  return remaining.filter((range) => range.end - range.start >= 0.1);
}

function cloneClipForTimeRange(
  clip: VideoProjectClip,
  range: ClipTimeRange,
  preserveId: boolean,
  sharedGroupId: string | null
): VideoProjectClip | null {
  const duration = range.end - range.start;
  if (duration < 0.1) {
    return null;
  }

  const baseClip: VideoProjectClip = {
    ...clip,
    id: preserveId ? clip.id : crypto.randomUUID(),
    startTime: range.start,
    duration,
    groupId: sharedGroupId,
    transform: { ...clip.transform },
  } as VideoProjectClip;

  if (
    (isVideoClip(baseClip) && isVideoClip(clip)) ||
    (isAudioClip(baseClip) && isAudioClip(clip))
  ) {
    const sourceOffset = range.start - clip.startTime;
    return {
      ...baseClip,
      sourceStart: clip.sourceStart + sourceOffset,
      sourceDuration: duration,
    };
  }

  return baseClip;
}

function getSharedSegmentGroupId(
  clip: VideoProjectClip,
  segment: ClipTimeRange,
  segments: ClipTimeRange[],
  multiSegmentGroupIds: Map<string, string>
): string | null {
  if (!clip.groupId || clip.linkMode !== VideoClipLinkMode.LINKED) {
    return clip.groupId;
  }

  if (segments.length === 1) {
    return clip.groupId;
  }

  const key = `${clip.groupId}:${segment.start.toFixed(4)}:${segment.end.toFixed(4)}`;
  const existing = multiSegmentGroupIds.get(key);
  if (existing) {
    return existing;
  }

  const nextGroupId = crypto.randomUUID();
  multiSegmentGroupIds.set(key, nextGroupId);
  return nextGroupId;
}

export function splitClipAfterOverwrite(
  clip: VideoProjectClip,
  removals: ClipTimeRange[],
  multiSegmentGroupIds: Map<string, string>
): VideoProjectClip[] {
  const segments = subtractClipTimeRanges(
    { start: clip.startTime, end: getClipEndTime(clip) },
    removals
  );
  if (segments.length === 0) {
    return [];
  }

  return segments.flatMap((segment, index) => {
    const sharedGroupId = getSharedSegmentGroupId(clip, segment, segments, multiSegmentGroupIds);
    const nextClip = cloneClipForTimeRange(clip, segment, index === 0, sharedGroupId);
    return nextClip ? [nextClip] : [];
  });
}
