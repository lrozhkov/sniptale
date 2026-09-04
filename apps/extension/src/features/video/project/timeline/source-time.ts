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
  'duration' | 'id' | 'playbackRate' | 'sourceDuration' | 'sourceStart' | 'startTime'
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
    'duration' | 'id' | 'playbackRate' | 'sourceDuration' | 'sourceStart' | 'startTime'
  >[],
  sourceStart: number,
  sourceEnd: number
): SourceTimedProjectSpan[] {
  const normalizedSourceStart = Math.max(0, Math.min(sourceStart, sourceEnd));
  const normalizedSourceEnd = Math.max(normalizedSourceStart, Math.max(sourceStart, sourceEnd));

  return clips
    .flatMap((clip) => {
      const clipSourceStart = clip.sourceStart;
      const clipSourceEnd = clip.sourceStart + clip.sourceDuration;
      const spanSourceStart = Math.max(normalizedSourceStart, clipSourceStart);
      const spanSourceEnd = Math.min(normalizedSourceEnd, clipSourceEnd);
      if (spanSourceEnd <= spanSourceStart) {
        return [];
      }

      const startOffset = getSourceTimedClipProjectOffset(clip, spanSourceStart - clipSourceStart);
      const endOffset = getSourceTimedClipProjectOffset(clip, spanSourceEnd - clipSourceStart);

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
      clip.sourceStart + projectOffset * normalizeClipPlaybackRate(clip.playbackRate ?? 1),
    time: projectTime,
  };
}

export function mapSourceTimeToProjectPoint(
  clips: readonly SourceTimedPointClip[],
  sourceTime: number,
  preferredClipId?: string
): SourceTimedProjectPoint | null {
  const clip = resolvePreferredPointClip(
    clips.filter(
      (item) =>
        sourceTime >= item.sourceStart - SOURCE_POINT_EPSILON &&
        sourceTime <= item.sourceStart + item.sourceDuration + SOURCE_POINT_EPSILON
    ),
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

export function isLegacyScrollActionEvent(
  event: Pick<VideoProjectActionEvent, 'kind' | 'preset'>
): boolean {
  return event.kind === 'SCROLL' || event.preset === VideoProjectActionPreset.SCROLL_EMPHASIS;
}
