import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';

/** Navigation stays on the source axis while skipping removed head and tail spans. */
export function reviewTimelineNavigationBounds(duration: number, edits: readonly ReviewEdit[]) {
  const kept = buildReviewTimeMap(duration, edits).filter((segment) => segment.kind !== 'cut');
  return { start: kept[0]?.sourceStart ?? 0, end: kept.at(-1)?.sourceEnd ?? duration };
}

/** Advanced clips retain result times while every lane displays the original source axis. */
function createTimelineAxis(duration: number, edits: readonly ReviewEdit[]) {
  const segments = buildReviewTimeMap(duration, edits);
  const resultDuration = segments.at(-1)?.resultEnd ?? 0;
  const source = (time: number, edge: 'start' | 'end' = 'start') => {
    const visible = segments.filter((segment) => segment.kind !== 'cut');
    const part = visible.find((segment) =>
      edge === 'end'
        ? time > segment.resultStart && time <= segment.resultEnd
        : time >= segment.resultStart && time < segment.resultEnd
    );
    return part
      ? part.sourceStart + (time - part.resultStart) * part.rate
      : time <= 0
        ? (visible[0]?.sourceStart ?? 0)
        : (visible.at(-1)?.sourceEnd ?? duration);
  };
  const output = (time: number) => {
    const part = segments.find(
      (segment) => time >= segment.sourceStart && time < segment.sourceEnd
    );
    return part
      ? part.resultStart + (part.kind === 'cut' ? 0 : (time - part.sourceStart) / part.rate)
      : time <= 0
        ? 0
        : resultDuration;
  };
  return {
    duration,
    resultDuration,
    /** Visible music pieces share continuous output/sample time across source cuts. */
    slices: (start: number, end: number) =>
      segments
        .flatMap((part) => {
          if (part.kind === 'cut') return [];
          const from = Math.max(start, part.resultStart);
          const to = Math.min(end, part.resultEnd);
          return to > from
            ? [
                {
                  start: from,
                  end: to,
                  sourceStart:
                    from === part.resultStart
                      ? part.sourceStart
                      : part.sourceStart + (from - part.resultStart) * part.rate,
                  sourceEnd:
                    to === part.resultEnd
                      ? part.sourceEnd
                      : part.sourceStart + (to - part.resultStart) * part.rate,
                },
              ]
            : [];
        })
        .reduce<{ start: number; end: number; sourceStart: number; sourceEnd: number }[]>(
          (pieces, piece) => {
            const previous = pieces.at(-1);
            if (previous && previous.sourceEnd === piece.sourceStart) {
              previous.end = piece.end;
              previous.sourceEnd = piece.sourceEnd;
            } else pieces.push(piece);
            return pieces;
          },
          []
        ),
    source,
    output,
    cuts: segments.filter((segment) => segment.kind === 'cut'),
    position: (time: number, edge?: 'start' | 'end') => source(time, edge) / duration,
    delta: (at: number, pixels: number, width: number) =>
      output(at + (pixels / width) * duration) - output(at),
  };
}
/** Focus gestures use the original source clock, independent of cuts and video Speed. */
export function createTrackProjection(duration: number, edits: readonly ReviewEdit[]) {
  return {
    ...createTimelineAxis(duration, edits),
    focus: createTimelineAxis(duration, []),
  };
}
export type ReviewTrackProjection = ReturnType<typeof createTrackProjection>;

/** Disposable rows are stable for the authored snapshot, including during gesture previews. */
export function reviewAudioClipRows(
  ranges: readonly { id: string; start: number; end: number }[]
): Map<string, number> {
  const rows = new Map<string, number>();
  const ends: number[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
    const free = ends.findIndex((end) => end <= range.start);
    const row = free < 0 ? ends.length : free;
    ends[row] = range.end;
    rows.set(range.id, row);
  }
  return rows;
}
