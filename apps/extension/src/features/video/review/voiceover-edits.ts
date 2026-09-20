import type { QuickEditAudioClip, QuickEditVoiceoverAnchor } from './advanced/types';
import type { ReviewTimeSegment } from './timeline';

/** Captures the original video placement without trimming the audio asset or dropping a record. */
export function anchorReviewVoiceover(
  clip: QuickEditAudioClip,
  map: readonly ReviewTimeSegment[]
): QuickEditAudioClip {
  if (clip.sourceAnchor || clip.dormant) return clip;
  const anchors: QuickEditVoiceoverAnchor[] = [];
  for (const segment of map) {
    if (segment.kind === 'cut') continue;
    const start = Math.max(clip.timelineStart, segment.resultStart);
    const end = Math.min(clip.timelineStart + clip.duration, segment.resultEnd);
    if (end <= start) continue;
    anchors.push({
      start: segment.sourceStart + (start - segment.resultStart) * segment.rate,
      end: segment.sourceStart + (end - segment.resultStart) * segment.rate,
      offset: start - clip.timelineStart,
      duration: end - start,
    });
  }
  const last = map.at(-1);
  const covered = anchors.at(-1);
  // Preserve an authored tail beyond the current video end instead of silently trimming it.
  const offset = covered ? covered.offset + covered.duration : 0;
  if (last && offset < clip.duration) {
    const start = covered?.end ?? last.sourceEnd + Math.max(0, clip.timelineStart - last.resultEnd);
    anchors.push({
      start,
      end: start + clip.duration - offset,
      offset,
      duration: clip.duration - offset,
    });
  }
  return anchors.length
    ? { ...clip, timelineStart: anchors[0]!.start, sourceAnchor: anchors }
    : clip;
}

/** Source coordinates of the single retained record, including portions hidden by cuts. */
export function reviewVoiceoverRange(clip: QuickEditAudioClip) {
  return {
    start: clip.sourceAnchor?.[0]?.start ?? clip.timelineStart,
    end: clip.sourceAnchor?.at(-1)?.end ?? clip.timelineStart + clip.duration,
  };
}

/** Automatic suppression never changes the recording's authored mute flag. */
export function isReviewVoiceoverCut(
  clip: QuickEditAudioClip,
  map?: readonly ReviewTimeSegment[]
): boolean {
  return !!clip.sourceAnchor?.some((anchor) =>
    map?.some(
      (part) =>
        part.kind === 'cut' && anchor.start < part.sourceEnd && anchor.end > part.sourceStart
    )
  );
}

/** Intersected recordings are temporarily silent; the stored recording always remains whole. */
export function projectReviewVoiceover(
  clips: readonly QuickEditAudioClip[],
  map?: readonly ReviewTimeSegment[]
): QuickEditAudioClip[] {
  return clips.flatMap((clip) => {
    if (!clip.sourceAnchor || !map) return [clip];
    if (isReviewVoiceoverCut(clip, map)) return [];
    const start = clip.sourceAnchor[0]!.start;
    const segment = map.find(
      (part) => part.kind !== 'cut' && start >= part.sourceStart && start < part.sourceEnd
    );
    if (!segment) return [];
    const { sourceAnchor: _anchor, ...recording } = clip;
    return [
      {
        ...recording,
        timelineStart: segment.resultStart + (start - segment.sourceStart) / segment.rate,
      },
    ];
  });
}

/** Moving a retained recording shifts its complete placement, including currently cut portions. */
export function moveReviewVoiceover(
  clip: QuickEditAudioClip,
  requestedStart: number,
  sourceDuration: number
): QuickEditAudioClip {
  clip = { ...clip, duration: clip.sourceAnchor!.reduce((sum, span) => sum + span.duration, 0) };
  const range = reviewVoiceoverRange(clip);
  const start = Math.max(
    0,
    Math.min(requestedStart, Math.max(0, sourceDuration - (range.end - range.start)))
  );
  const delta = start - range.start;
  return {
    ...clip,
    timelineStart: start,
    sourceAnchor: clip.sourceAnchor!.map((span) => ({
      ...span,
      start: span.start + delta,
      end: span.end + delta,
    })),
  };
}

/** Converts a source-frame position into a recording-relative sample offset, extrapolating at trim edges. */
export function reviewVoiceoverOffset(clip: QuickEditAudioClip, time: number): number {
  const spans = clip.sourceAnchor!;
  const span = spans.find((part) => time < part.end) ?? spans.at(-1)!;
  if (span !== spans[0] && time < span.start) return span.offset;
  return span.offset + ((time - span.start) * span.duration) / (span.end - span.start);
}

/** Explicit edge trimming changes the asset range; timeline cuts never call this function. */
export function trimReviewVoiceover(
  clip: QuickEditAudioClip,
  edge: 'start' | 'end',
  time: number,
  sourceDuration: number,
  assetDuration?: number
): QuickEditAudioClip {
  clip = { ...clip, duration: clip.sourceAnchor!.reduce((sum, span) => sum + span.duration, 0) };
  const offset = reviewVoiceoverOffset(clip, Math.max(0, Math.min(time, sourceDuration)));
  const from =
    edge === 'start' ? Math.max(-clip.sourceOffset, Math.min(offset, clip.duration - 0.001)) : 0;
  const to =
    edge === 'end'
      ? Math.max(
          0.001,
          Math.min(offset, (assetDuration ?? clip.sourceOffset + clip.duration) - clip.sourceOffset)
        )
      : clip.duration;
  const anchors = clip.sourceAnchor!;
  const expanded = anchors
    .map((span, index) => {
      const rate = (span.end - span.start) / span.duration;
      const startOffset = index === 0 ? Math.min(from, span.offset) : span.offset;
      const endOffset =
        index === anchors.length - 1
          ? Math.max(to, span.offset + span.duration)
          : span.offset + span.duration;
      const start = Math.max(from, startOffset);
      const end = Math.min(to, endOffset);
      return end > start
        ? [
            {
              start: span.start + (start - span.offset) * rate,
              end: span.start + (end - span.offset) * rate,
              offset: start - from,
              duration: end - start,
            },
          ]
        : [];
    })
    .flat();
  return {
    ...clip,
    timelineStart: expanded[0]!.start,
    sourceOffset: clip.sourceOffset + from,
    duration: to - from,
    sourceAnchor: expanded,
    fadeIn: Math.min(clip.fadeIn, to - from),
    fadeOut: Math.min(clip.fadeOut, to - from),
  };
}
