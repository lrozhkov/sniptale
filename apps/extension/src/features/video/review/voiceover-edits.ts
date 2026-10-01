import type { QuickEditAudioClip, QuickEditVoiceoverAnchor } from './advanced/types';
import type { ReviewTimeSegment } from './timeline';
import type { ReviewEdit } from './types';

/**
 * Replaces creation-time compensation with native sample timing when a new Speed
 * command affects a retained recording. Later anchors move, preserving sample
 * order and authored source gaps; unrelated recordings and legacy replay do not.
 */
export function normalizeReviewVoiceoverTempo(
  clip: QuickEditAudioClip,
  before: ReviewEdit | null,
  after: ReviewEdit | null
): QuickEditAudioClip {
  if (!clip.sourceAnchor || clip.dormant) return clip;
  const previous = before?.kind === 'speed' ? before : null;
  const next = after?.kind === 'speed' ? after : null;
  if (!previous && !next) return clip;
  if (
    previous &&
    next &&
    previous.start === next.start &&
    previous.end === next.end &&
    previous.rate === next.rate
  )
    return clip;
  const anchors = clip.sourceAnchor;
  if (
    !anchors.some((span) => Math.abs(span.end - span.start - span.duration) > 1e-7) ||
    !anchors.some((span) =>
      [previous, next].some((edit) => edit && span.start < edit.end && span.end > edit.start)
    )
  )
    return clip;
  let start = anchors[0]!.start;
  const normalized = anchors.map((span, index) => {
    const end = start + span.duration;
    const result = { ...span, start, end };
    const following = anchors[index + 1];
    start = end + (following ? following.start - span.end : 0);
    return result;
  });
  return { ...clip, sourceAnchor: normalized };
}

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

/** Visible recording slices retain sample offsets and fade phase; stored recordings remain whole. */
export function projectReviewVoiceover(
  clips: readonly QuickEditAudioClip[],
  map?: readonly ReviewTimeSegment[]
): QuickEditAudioClip[] {
  return clips.flatMap((clip) => {
    if (!clip.sourceAnchor || !map) return [clip];
    const { sourceAnchor: _anchor, ...recording } = clip;
    const slices = clip.sourceAnchor.flatMap((anchor, anchorIndex) =>
      map.flatMap((part) => {
        if (part.kind === 'cut') return [];
        const start = Math.max(anchor.start, part.sourceStart);
        const end = Math.min(anchor.end, part.sourceEnd);
        if (end <= start) return [];
        const assetPerSource = anchor.duration / (anchor.end - anchor.start);
        const assetOffset = anchor.offset + (start - anchor.start) * assetPerSource;
        const duration = (end - start) / part.rate;
        return [
          {
            ...recording,
            id: `${clip.id}:slice:${anchorIndex}:${part.sourceStart}`,
            timelineStart: part.resultStart + (start - part.sourceStart) / part.rate,
            sourceOffset: clip.sourceOffset + assetOffset,
            duration,
            playbackRate: assetPerSource * part.rate,
            fadePhase: { offset: assetOffset, duration: clip.duration },
          },
        ];
      })
    );
    const continuous: QuickEditAudioClip[] = [];
    for (const slice of slices) {
      const previous = continuous.at(-1);
      if (
        previous &&
        Math.abs(previous.playbackRate! - slice.playbackRate!) < 1e-7 &&
        Math.abs(previous.timelineStart + previous.duration - slice.timelineStart) < 1e-7 &&
        Math.abs(
          previous.sourceOffset + previous.duration * previous.playbackRate! - slice.sourceOffset
        ) < 1e-7
      ) {
        previous.duration += slice.duration;
      } else continuous.push(slice);
    }
    return continuous.length === 1 ? [{ ...continuous[0]!, id: clip.id }] : continuous;
  });
}

/** Actual audible duration; raw sample seconds are independent of applied Speed. */
export function reviewVoiceoverPlaybackDuration(
  clip: QuickEditAudioClip,
  map?: readonly ReviewTimeSegment[]
) {
  return projectReviewVoiceover([clip], map).reduce(
    (duration, slice) => duration + slice.duration,
    0
  );
}

/** Moving a retained recording shifts its complete placement, including currently cut portions. */
export function moveReviewVoiceover(
  clip: QuickEditAudioClip,
  requestedStart: number,
  sourceDuration: number,
  map?: readonly ReviewTimeSegment[]
): QuickEditAudioClip {
  clip = { ...clip, duration: clip.sourceAnchor!.reduce((sum, span) => sum + span.duration, 0) };
  if (map && !clip.dormant && !isReviewVoiceoverCut(clip, map))
    return placeAudibleVoiceover(clip, requestedStart, sourceDuration, map);
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

function placeAudibleVoiceover(
  clip: QuickEditAudioClip,
  requestedStart: number,
  sourceDuration: number,
  map: readonly ReviewTimeSegment[]
): QuickEditAudioClip {
  const duration = reviewVoiceoverPlaybackDuration(clip, map);
  const requested = Math.max(0, Math.min(requestedStart, sourceDuration));
  const segment = map.find(
    (part) =>
      part.kind !== 'cut' &&
      requested >= part.sourceStart &&
      (requested < part.sourceEnd ||
        (requested === sourceDuration && part.sourceEnd === sourceDuration))
  );
  if (!segment || duration <= 0 || duration > map.at(-1)!.resultEnd) return clip;
  const outputStart = Math.max(
    0,
    Math.min(
      segment.resultStart +
        (Math.min(requested, segment.sourceEnd) - segment.sourceStart) / segment.rate,
      map.at(-1)!.resultEnd - duration
    )
  );
  const { sourceAnchor: _anchor, ...recording } = clip;
  const placed = anchorReviewVoiceover({ ...recording, timelineStart: outputStart, duration }, map);
  if (!placed.sourceAnchor || placed.sourceAnchor.at(-1)!.end > sourceDuration + 1e-7) return clip;
  const scale = clip.duration / duration;
  return {
    ...clip,
    timelineStart: placed.timelineStart,
    sourceAnchor: placed.sourceAnchor.map((span) => ({
      ...span,
      offset: span.offset * scale,
      duration: span.duration * scale,
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
