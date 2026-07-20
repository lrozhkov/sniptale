import type {
  VideoProjectActionEvent,
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../types/index';
import { VideoProjectActionPreset } from '../types/index';
import { getSourceTimedClipProjectOffset } from './basics';

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

export function isLegacyScrollActionEvent(
  event: Pick<VideoProjectActionEvent, 'kind' | 'preset'>
): boolean {
  return event.kind === 'SCROLL' || event.preset === VideoProjectActionPreset.SCROLL_EMPHASIS;
}
