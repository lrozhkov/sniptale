import type { QuickEditAudioClip } from './advanced/types';
import type { ReviewTextDocument, ReviewTextFragment } from './text-types';
import type { ReviewTimeSegment } from './time-segment';
import type { ReviewEdit } from './types';
import {
  anchorReviewVoiceover,
  anchorReviewVoiceoverAtSource,
  normalizeReviewVoiceoverTempo,
  projectReviewVoiceover,
  reviewVoiceoverNativeIntervals,
  reviewVoiceoverRange,
} from './voiceover-edits';
import { retimeReviewVoiceover, reviewVoiceoverSampleDelta } from './voiceover-timing';

/** Temporal adapter only: text does not acquire an audio resource or an audio lifetime. */
function textClip(fragment: ReviewTextFragment): QuickEditAudioClip {
  return {
    id: fragment.id,
    assetId: 'text-timing',
    timelineStart: fragment.start,
    sourceOffset: 0,
    duration: fragment.sourceAnchor?.duration ?? fragment.end - fragment.start,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    ...(fragment.sourceAnchor ? { sourceAnchor: fragment.sourceAnchor.spans } : {}),
  };
}

/** Captures the authored text clock before the first new video timing command. */
function anchorText(fragment: ReviewTextFragment, map: readonly ReviewTimeSegment[]) {
  if (fragment.sourceAnchor) return fragment;
  const source = fragment.timeDomain === 'source';
  const duration = source
    ? reviewVoiceoverSampleDelta(fragment.start, fragment.end, 1, map)
    : fragment.end - fragment.start;
  const clip = { ...textClip(fragment), duration };
  const anchored = source
    ? anchorReviewVoiceoverAtSource(clip, map)
    : anchorReviewVoiceover(clip, map);
  if (!anchored.sourceAnchor) return fragment;
  const offset = (time: number) =>
    source ? reviewVoiceoverSampleDelta(fragment.start, time, 1, map) : time - fragment.start;
  return {
    ...fragment,
    sourceAnchor: {
      duration,
      spans: anchored.sourceAnchor,
      ...(fragment.words
        ? {
            words: fragment.words.map((word) => ({
              ...word,
              start: offset(word.start),
              end: offset(word.end),
            })),
          }
        : {}),
    },
  };
}

/** Exact visible slices use the same native-duration projection as an ordinary voice take. */
export function projectAnchoredReviewText(
  fragment: ReviewTextFragment,
  map: readonly ReviewTimeSegment[]
) {
  return projectReviewVoiceover([textClip(fragment)], map).map((slice) => ({
    start: slice.timelineStart,
    end: slice.timelineStart + slice.duration,
  }));
}

/** The timeline retains source positions, including text temporarily hidden by a Cut. */
export function reviewTextSourceInterval(
  fragment: ReviewTextFragment,
  map: readonly ReviewTimeSegment[]
) {
  return reviewVoiceoverRange(retimeReviewVoiceover(textClip(fragment), map));
}

/** New video commands retain native text timing without changing legacy history replay. */
export function retimeReviewTextDocument(
  document: ReviewTextDocument,
  before: readonly ReviewTimeSegment[],
  after: readonly ReviewTimeSegment[],
  previousEdit: ReviewEdit | null,
  nextEdit: ReviewEdit | null
): ReviewTextDocument {
  return {
    ...document,
    fragments: document.fragments.map((original) => {
      const fragment = anchorText(original, before);
      if (!fragment.sourceAnchor) return original;
      const clip = normalizeReviewVoiceoverTempo(textClip(fragment), previousEdit, nextEdit);
      const sourceAnchor = { ...fragment.sourceAnchor, spans: clip.sourceAnchor! };
      const slices = projectReviewVoiceover([clip], after);
      const start = slices.length
        ? Math.min(...slices.map((slice) => slice.timelineStart))
        : fragment.start;
      const end = slices.length
        ? Math.max(...slices.map((slice) => slice.timelineStart + slice.duration))
        : fragment.end;
      const { words: _words, ...base } = fragment;
      const words = sourceAnchor.words?.flatMap((word) => {
        const ranges = reviewVoiceoverNativeIntervals(clip, word, after);
        return ranges.length
          ? [{ text: word.text, start: ranges[0]!.start, end: ranges.at(-1)!.end }]
          : [];
      });
      return {
        ...base,
        timeDomain: 'result' as const,
        start,
        end,
        sourceAnchor,
        ...(words?.length ? { words } : {}),
      };
    }),
  };
}
