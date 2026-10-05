import { reviewPlaybackTime, reviewPlaybackSettings } from '../../features/video/review/cuts';
import type { ReviewEdit } from '../../features/video/review/types';

/** Disposable source-time transport restriction; never part of the document. */
export type ReviewPlaybackRange = { start: number; end: number };

/** Normalize gesture endpoints into a usable source interval. */
export function createReviewPlaybackRange(
  anchor: number,
  target: number,
  duration: number
): ReviewPlaybackRange | null {
  if (![anchor, target, duration].every(Number.isFinite) || duration <= 0) return null;
  const start = Math.max(0, Math.min(duration, Math.min(anchor, target)));
  const end = Math.max(0, Math.min(duration, Math.max(anchor, target)));
  return end - start + 1e-9 >= 0.05 ? { start, end } : null;
}

/** First representable kept source sample in the half-open interval. */
export function reviewPlaybackRangeStart(
  range: ReviewPlaybackRange,
  edits: readonly ReviewEdit[]
): number | null {
  let start = reviewCutSeekTarget(range.start);
  while (start < range.end) {
    const kept = reviewPlaybackTime(start, edits);
    if (kept === start) return start;
    start = reviewCutSeekTarget(kept);
  }
  return null;
}

/** Chromium converts seconds to microseconds; cut destinations must round forward. */
function reviewCutSeekTarget(time: number): number {
  const rounded = Math.ceil(time * 1e6) / 1e6;
  return Math.floor(rounded * 1e6) / 1e6 < time ? rounded + 1e-6 : rounded;
}

/** Resolves a source sample under cuts and a disposable loop without touching the media clock. */
export function resolveReviewPlaybackSample(args: {
  time: number;
  applyEdits: boolean;
  duration: number;
  edits: readonly ReviewEdit[];
  retainCutTime: boolean;
  range: ReviewPlaybackRange | null;
}) {
  const inRecordedCut =
    args.retainCutTime &&
    args.edits.some(
      (edit) => edit.kind === 'cut' && args.time >= edit.start && args.time < edit.end
    );
  const settings = inRecordedCut
    ? { time: args.time, rate: 1, muted: true }
    : reviewPlaybackSettings(args.time, args.edits);
  let time =
    args.applyEdits && settings.time !== args.time
      ? Math.min(args.duration, reviewCutSeekTarget(settings.time))
      : args.time;
  const range = args.retainCutTime ? null : args.range;
  const start = range && reviewPlaybackRangeStart(range, args.edits);
  const looped = !!range && start !== null && (time < range.start || time >= range.end);
  if (looped && start !== null) time = start;
  const effective = time === settings.time ? settings : reviewPlaybackSettings(time, args.edits);
  return { time, rate: effective.rate, muted: effective.muted, looped };
}
