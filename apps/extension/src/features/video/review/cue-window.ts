import type { ReviewTimeSegment } from './timeline';
export function reviewCueWindow(
  segments: readonly ReviewTimeSegment[],
  sourceTime: number,
  offset: number,
  before: number,
  after: number,
  timeDomain?: 'result'
) {
  if (timeDomain === 'result') {
    const duration = segments.at(-1)?.resultEnd ?? 0;
    const anchor = sourceTime + offset;
    return { anchor, start: Math.max(0, anchor - before), end: Math.min(duration, anchor + after) };
  }
  const index = segments.findIndex(
    (part) => sourceTime >= part.sourceStart && sourceTime < part.sourceEnd
  );
  const part = segments[index];
  if (!part || part.kind === 'cut') return null;
  let first = index;
  let last = index;
  while (first > 0 && segments[first - 1]!.kind !== 'cut') first--;
  while (last + 1 < segments.length && segments[last + 1]!.kind !== 'cut') last++;
  const anchor = part.resultStart + (sourceTime - part.sourceStart) / part.rate + offset;
  return {
    anchor,
    start: Math.max(segments[first]!.resultStart, anchor - before),
    end: Math.min(segments[last]!.resultEnd, anchor + after),
  };
}
