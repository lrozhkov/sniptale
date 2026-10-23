import type {
  VideoProjectActionEvent,
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../types/index';
import { VideoProjectActionPreset } from '../types/index';
import { getSourceTimedClipProjectOffset } from './basics';
import { normalizeClipPlaybackRate } from './basics';

const SOURCE_POINT_EPSILON = 0.000_001;

type SourceTimedPointClip = Pick<
  VideoProjectVideoClip | VideoProjectAudioClip,
  | 'duration'
  | 'id'
  | 'playbackRate'
  | 'playbackWindow'
  | 'sourceDuration'
  | 'sourceStart'
  | 'startTime'
>;

interface SourceTimedProjectPoint {
  clipId: string;
  sourceTime: number;
  time: number;
}

export interface SourceTimedProjectSpan {
  clipId: string;
  endTime: number;
  sourceEnd: number;
  sourceStart: number;
  startTime: number;
}

export function mapSourceRangeToProjectSpans(
  clips: readonly Pick<
    VideoProjectVideoClip | VideoProjectAudioClip,
    | 'duration'
    | 'id'
    | 'playbackRate'
    | 'playbackWindow'
    | 'sourceDuration'
    | 'sourceStart'
    | 'startTime'
  >[],
  sourceStart: number,
  sourceEnd: number
): SourceTimedProjectSpan[] {
  const normalizedSourceStart = Math.max(0, Math.min(sourceStart, sourceEnd));
  const normalizedSourceEnd = Math.max(normalizedSourceStart, Math.max(sourceStart, sourceEnd));

  return clips
    .flatMap((clip) => {
      const rate = normalizeClipPlaybackRate(clip.playbackRate ?? 1);
      const offset = clip.playbackWindow?.offset ?? 0;
      const hold = clip.playbackWindow?.holdAt ?? Infinity;
      const clipSourceStart = clip.sourceStart + Math.min(offset, hold) * rate;
      const clipSourceEnd =
        clip.sourceStart +
        Math.min(clip.sourceDuration, Math.min(offset + clip.duration, hold) * rate);
      const spanSourceStart = Math.max(normalizedSourceStart, clipSourceStart);
      const spanSourceEnd = Math.min(normalizedSourceEnd, clipSourceEnd);
      const heldSource = clip.sourceStart + hold * rate;
      const includesHold =
        hold <= offset + clip.duration &&
        heldSource >= normalizedSourceStart &&
        heldSource < normalizedSourceEnd &&
        heldSource <= clip.sourceStart + clip.sourceDuration;
      if (spanSourceEnd < spanSourceStart || (spanSourceEnd === spanSourceStart && !includesHold))
        return [];
      const startOffset = Math.max(
        0,
        getSourceTimedClipProjectOffset(clip, spanSourceStart - clip.sourceStart)
      );
      const endOffset = includesHold
        ? clip.duration
        : Math.min(
            clip.duration,
            getSourceTimedClipProjectOffset(clip, spanSourceEnd - clip.sourceStart)
          );
      if (endOffset <= startOffset) return [];

      return [
        {
          clipId: clip.id,
          startTime: clip.startTime + startOffset,
          endTime: clip.startTime + endOffset,
          sourceStart: spanSourceStart,
          sourceEnd: spanSourceEnd,
        },
      ];
    })
    .sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime);
}

export function mapProjectTimeToSourcePoint(
  clips: readonly SourceTimedPointClip[],
  projectTime: number,
  preferredClipId?: string
): SourceTimedProjectPoint | null {
  const clip = resolvePreferredPointClip(
    clips.filter(
      (item) =>
        projectTime >= item.startTime - SOURCE_POINT_EPSILON &&
        projectTime <= item.startTime + item.duration + SOURCE_POINT_EPSILON
    ),
    preferredClipId,
    (left, right) => right.startTime - left.startTime
  );
  if (!clip) {
    return null;
  }

  const projectOffset = Math.min(Math.max(0, projectTime - clip.startTime), clip.duration);
  return {
    clipId: clip.id,
    sourceTime:
      clip.sourceStart +
      Math.min(
        clip.playbackWindow ? clip.sourceDuration : Infinity,
        Math.min(
          (clip.playbackWindow?.offset ?? 0) + projectOffset,
          clip.playbackWindow?.holdAt ?? Infinity
        ) * normalizeClipPlaybackRate(clip.playbackRate ?? 1)
      ),
    time: projectTime,
  };
}

export function mapSourceTimeToProjectPoint(
  clips: readonly SourceTimedPointClip[],
  sourceTime: number,
  preferredClipId?: string
): SourceTimedProjectPoint | null {
  const clip = resolvePreferredPointClip(
    clips.filter((item) => {
      const offset = getSourceTimedClipProjectOffset(item, sourceTime - item.sourceStart);
      return (
        sourceTime >= item.sourceStart - SOURCE_POINT_EPSILON &&
        sourceTime <= item.sourceStart + item.sourceDuration + SOURCE_POINT_EPSILON &&
        offset >= -SOURCE_POINT_EPSILON &&
        offset <= item.duration + SOURCE_POINT_EPSILON &&
        (item.playbackWindow?.holdAt === undefined ||
          sourceTime <=
            item.sourceStart +
              item.playbackWindow.holdAt * normalizeClipPlaybackRate(item.playbackRate ?? 1) +
              SOURCE_POINT_EPSILON)
      );
    }),
    preferredClipId,
    (left, right) => right.sourceStart - left.sourceStart || left.startTime - right.startTime
  );
  if (!clip) {
    return null;
  }

  const sourceOffset = Math.min(Math.max(0, sourceTime - clip.sourceStart), clip.sourceDuration);
  return {
    clipId: clip.id,
    sourceTime,
    time: clip.startTime + getSourceTimedClipProjectOffset(clip, sourceOffset),
  };
}

function resolvePreferredPointClip(
  clips: SourceTimedPointClip[],
  preferredClipId: string | undefined,
  compare: (left: SourceTimedPointClip, right: SourceTimedPointClip) => number
): SourceTimedPointClip | null {
  if (preferredClipId) {
    const preferred = clips.find((clip) => clip.id === preferredClipId);
    if (preferred) {
      return preferred;
    }
  }

  return [...clips].sort(compare)[0] ?? null;
}

export function isScrollActionEvent(
  event: Pick<VideoProjectActionEvent, 'kind' | 'presentation'>
): boolean {
  return (
    event.kind === 'SCROLL' ||
    event.presentation?.preset === VideoProjectActionPreset.SCROLL_EMPHASIS
  );
}
