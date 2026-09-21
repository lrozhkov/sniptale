import type { QuickEditZoomRegion } from './advanced/types';
import { buildReviewTimeMap, type ReviewTimeSegment } from './timeline';
import type { ReviewEdit } from './types';

function sourceRange(region: QuickEditZoomRegion, segments: readonly ReviewTimeSegment[]) {
  const visible = segments.filter((part) => part.kind !== 'cut');
  const first = visible.find(
    (part) => region.start >= part.resultStart && region.start < part.resultEnd
  );
  const last = visible.find(
    (part) => region.end > part.resultStart && region.end <= part.resultEnd
  );
  if (!first || !last) return null;
  return {
    start: first.sourceStart + (region.start - first.resultStart) * first.rate,
    end: last.sourceStart + (region.end - last.resultStart) * last.rate,
  };
}

function resultBoundary(time: number, segments: readonly ReviewTimeSegment[], end: boolean) {
  const part = segments.find(
    (segment) =>
      segment.kind !== 'cut' &&
      (end
        ? time > segment.sourceStart && time <= segment.sourceEnd
        : time >= segment.sourceStart && time < segment.sourceEnd)
  );
  return part ? part.resultStart + (time - part.sourceStart) / part.rate : null;
}

/** Reanchors surviving focus to the same source frames as one edit history operation. */
export function reconcileReviewFocus(args: {
  regions: readonly QuickEditZoomRegion[];
  duration: number;
  before: readonly ReviewEdit[];
  after: readonly ReviewEdit[];
  edit: ReviewEdit | null;
}): QuickEditZoomRegion[] {
  const previous = buildReviewTimeMap(args.duration, args.before);
  const next = buildReviewTimeMap(args.duration, args.after);
  const cut = args.edit?.kind === 'cut' ? args.edit : null;
  const sourceRanges = new Map(
    args.regions.map((region) => [region.id, sourceRange(region, previous)])
  );
  const intersects = (start: number, end: number) => !!cut && start < cut.end && end > cut.start;
  const regions = args.regions.flatMap((region) => {
    if (region.dormant) return [region];
    const range = sourceRanges.get(region.id);
    if (!range) return [{ ...region, dormant: true }];
    if (intersects(range.start, range.end)) return [];
    const start = resultBoundary(range.start, next, false);
    const end = resultBoundary(range.end, next, true);
    if (start === null || end === null || end <= start) return [];
    return [{ ...region, start, end }];
  });
  const retained = new Set(regions.map((region) => region.id));
  return regions.map((region) => {
    if (!region.linkTo) return region;
    const from = sourceRanges.get(region.id);
    const to = sourceRanges.get(region.linkTo);
    if (retained.has(region.linkTo) && !(from && to && intersects(from.end, to.start)))
      return region;
    const { linkTo: _linkTo, linkEasing: _linkEasing, ...unlinked } = region;
    return unlinked;
  });
}
