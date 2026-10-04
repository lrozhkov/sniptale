import { fitQuickEditZoomTransitions } from './advanced/zoom';
import type { QuickEditZoomRegion } from './advanced/types';
import { buildReviewTimeMap, type ReviewTimeSegment } from './timeline';
import type { ReviewEdit } from './types';

export function reviewFocusSourceRange(
  region: Pick<QuickEditZoomRegion, 'start' | 'end'>,
  segments: readonly ReviewTimeSegment[]
) {
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
  preserveUnderCuts?: true;
}): QuickEditZoomRegion[] {
  const previous = buildReviewTimeMap(args.duration, args.before);
  const next = buildReviewTimeMap(args.duration, args.after);
  if (args.preserveUnderCuts) {
    return args.regions.map((region) => {
      if (region.dormant) return region;
      const anchor = region.sourceAnchor ?? reviewFocusSourceRange(region, previous);
      if (!anchor) return { ...region, dormant: true };
      const visible = next.flatMap((part) => {
        if (part.kind === 'cut') return [];
        const start = Math.max(anchor.start, part.sourceStart);
        const end = Math.min(anchor.end, part.sourceEnd);
        return end > start
          ? [
              {
                start: part.resultStart + (start - part.sourceStart) / part.rate,
                end: part.resultStart + (end - part.sourceStart) / part.rate,
              },
            ]
          : [];
      });
      return {
        ...region,
        sourceAnchor: anchor,
        ...(visible.length ? { start: visible[0]!.start, end: visible.at(-1)!.end } : {}),
      };
    });
  }
  const cut = args.edit?.kind === 'cut' ? args.edit : null;
  const sourceRanges = new Map(
    args.regions.map((region) => [region.id, reviewFocusSourceRange(region, previous)])
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

/** Visible focus spans are derived from retained source geometry; cuts never mutate the authored effect. */
export function projectReviewFocus(
  regions: readonly QuickEditZoomRegion[],
  map?: readonly ReviewTimeSegment[]
): QuickEditZoomRegion[] {
  const active = regions
    .filter((region) => !region.dormant)
    .map((region) => fitQuickEditZoomTransitions(region));
  if (!map) return active;
  const resultDuration = (start: number, end: number) =>
    map.reduce(
      (duration, part) =>
        duration +
        (part.kind === 'cut'
          ? 0
          : Math.max(0, Math.min(end, part.sourceEnd) - Math.max(start, part.sourceStart)) /
            part.rate),
      0
    );
  const visible = active.map((region) => {
    const anchor = region.sourceAnchor;
    if (!anchor) return [region];
    const spans: { start: number; end: number; sourceStart: number; sourceEnd: number }[] = [];
    for (const part of map) {
      if (part.kind === 'cut') continue;
      const sourceStart = Math.max(anchor.start, part.sourceStart);
      const sourceEnd = Math.min(anchor.end, part.sourceEnd);
      if (sourceEnd <= sourceStart) continue;
      const start = part.resultStart + (sourceStart - part.sourceStart) / part.rate;
      const end = part.resultStart + (sourceEnd - part.sourceStart) / part.rate;
      const previous = spans.at(-1);
      if (previous && Math.abs(previous.sourceEnd - sourceStart) < 0.000001) {
        previous.end = end;
        previous.sourceEnd = sourceEnd;
      } else spans.push({ start, end, sourceStart, sourceEnd });
    }
    return spans.map((span, index) => {
      const { linkTo: _linkTo, linkEasing: _linkEasing, ...withoutLink } = region;
      return {
        ...withoutLink,
        ...(index === spans.length - 1 && region.linkTo
          ? {
              linkTo: region.linkTo,
              ...(region.linkEasing ? { linkEasing: region.linkEasing } : {}),
            }
          : {}),
        id: index === 0 ? region.id : `${region.id}:slice:${index}`,
        start: span.start,
        end: span.end,
        enter:
          span.sourceStart > anchor.start
            ? { type: 'none' as const, duration: 0 }
            : {
                ...region.enter,
                duration: resultDuration(
                  anchor.start,
                  Math.min(span.sourceEnd, anchor.start + region.enter.duration)
                ),
              },
        exit:
          span.sourceEnd < anchor.end
            ? { type: 'none' as const, duration: 0 }
            : {
                ...region.exit,
                duration: resultDuration(
                  Math.max(span.sourceStart, anchor.end - region.exit.duration),
                  anchor.end
                ),
              },
      };
    });
  });
  return visible.flatMap((slices, index) =>
    slices.map((slice, sliceIndex) => {
      if (!slice.linkTo) return slice;
      const target = active[index + 1];
      const targetSlice = visible[index + 1]?.[0];
      const gapCut = !!map.some(
        (part) =>
          part.kind === 'cut' &&
          part.sourceStart < (target?.sourceAnchor?.start ?? Infinity) &&
          part.sourceEnd > (active[index]?.sourceAnchor?.end ?? -Infinity)
      );
      if (
        sliceIndex !== slices.length - 1 ||
        !targetSlice ||
        slice.linkTo !== target?.id ||
        gapCut
      ) {
        const { linkTo: _linkTo, linkEasing: _linkEasing, ...unlinked } = slice;
        return unlinked;
      }
      return { ...slice, linkTo: targetSlice.id };
    })
  );
}
