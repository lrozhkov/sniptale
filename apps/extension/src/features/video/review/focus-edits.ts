import {
  anchorReviewVisual,
  anchorReviewVisualSource,
  projectReviewVisualAnchor,
  reviewVisualAnchorDuration,
} from './visual-anchor';
import { projectReviewVisualRange, retimeReviewResultRange } from './timeline-placement';
import {
  resolveQuickEditActiveFocusRegions,
  resolveQuickEditFocusLink,
} from './advanced/focus-layout';
import { projectSourceFocusPhases } from '../project/motion/source-phase-projection';
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
  preserveVisualAnchors?: true;
}): QuickEditZoomRegion[] {
  const previous = buildReviewTimeMap(args.duration, args.before);
  const next = buildReviewTimeMap(args.duration, args.after);
  if (args.preserveUnderCuts) {
    const frozenSourceMap =
      args.preserveVisualAnchors &&
      args.before.some((edit) => edit.kind === 'freeze') &&
      args.regions.some((region) => region.sourceAnchor && !region.visualAnchor)
        ? buildReviewTimeMap(
            args.duration,
            args.before.filter((edit) => edit.kind !== 'cut')
          )
        : undefined;
    return args.regions.map((region) => {
      if (region.visualAnchor) return region;
      if (args.preserveVisualAnchors) {
        if (region.timeDomain === 'result') return anchorReviewVisual(region, previous);
        if (region.sourceAnchor && frozenSourceMap) {
          const frozenPlacement = projectReviewVisualRange(region.sourceAnchor, frozenSourceMap);
          if (frozenPlacement)
            return anchorReviewVisual({ ...region, ...frozenPlacement }, frozenSourceMap);
        }
        if (region.sourceAnchor) {
          const anchor = region.sourceAnchor;
          return next.some(
            (part) =>
              part.kind === 'cut' && anchor.start < part.sourceEnd && anchor.end > part.sourceStart
          )
            ? { ...region, visualAnchor: anchorReviewVisualSource(anchor) }
            : region;
        }
      }
      if (region.timeDomain === 'result') {
        const range = retimeReviewResultRange(region, previous, next);
        return range.end > range.start ? { ...region, ...range } : { ...region, dormant: true };
      }
      if (region.dormant) return region;
      const anchor = region.sourceAnchor ?? reviewFocusSourceRange(region, previous);
      if (!anchor) return { ...region, dormant: true };
      const visible = projectReviewVisualRange(anchor, next);
      return {
        ...region,
        sourceAnchor: anchor,
        ...(visible ?? {}),
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
  return projectReviewFocusGroups(regions, map).flatMap(({ slices }) => slices);
}

/** Keeps projected slices together for render and Native link continuity. */
export function projectReviewFocusGroups(
  regions: readonly QuickEditZoomRegion[],
  map?: readonly ReviewTimeSegment[]
) {
  const active = resolveQuickEditActiveFocusRegions(regions).map((region) =>
    fitQuickEditZoomTransitions(region)
  );
  if (!map) return active.map((region) => ({ region, slices: [region] }));
  const sourceSpans = map.flatMap((part) =>
    part.kind === 'cut'
      ? []
      : [
          {
            sourceStart: part.sourceStart,
            sourceEnd: part.sourceEnd,
            start: part.resultStart,
            end: part.resultEnd,
            rate: part.rate,
          },
        ]
  );
  const inserted = map.some((part) => part.kind === 'freeze');
  const visible = active.map((region) => {
    if (region.visualAnchor) {
      const { visualAnchor, sourceAnchor: _anchor, linkTo, linkEasing, ...authored } = region;
      const slices = projectReviewVisualAnchor(visualAnchor, map);
      return slices.map((slice, index) => {
        const clock = {
          offset: slice.offset,
          rate: slice.rate,
          duration: reviewVisualAnchorDuration(visualAnchor),
          enter: region.enter,
          exit: region.exit,
        };
        return {
          ...authored,
          id: index === 0 ? region.id : `${region.id}:slice:${index}`,
          start: slice.start,
          end: slice.end,
          phaseClock: clock,
          ...(region.effect === '3d' ? { spatialClock: clock } : {}),
          ...(region.border ? { borderClock: clock } : {}),
          ...(index === slices.length - 1 && linkTo ? { linkTo } : {}),
          ...(index === slices.length - 1 && linkTo && linkEasing ? { linkEasing } : {}),
        };
      });
    }
    const anchor = region.timeDomain === 'result' ? undefined : region.sourceAnchor;
    if (!anchor) return [region];
    if (inserted) {
      const range = projectReviewVisualRange(anchor, map);
      if (!range) return [];
      const {
        sourceAnchor: _sourceAnchor,
        phaseClock: _phaseClock,
        spatialClock: _spatialClock,
        ...continuous
      } = region;
      return [{ ...continuous, ...range, timeDomain: 'result' as const }];
    }
    const spans = projectSourceFocusPhases(
      { sourceStart: anchor.start, sourceEnd: anchor.end, enter: region.enter, exit: region.exit },
      sourceSpans,
      { splitAtRates: inserted || !!region.border || region.effect === '3d' }
    );
    return spans.map((span, index) => {
      const { linkTo: _linkTo, linkEasing: _linkEasing, ...withoutLink } = region;
      return {
        ...withoutLink,
        ...(region.effect === '3d'
          ? {
              spatialClock: {
                offset: span.sourceStart - anchor.start,
                rate: span.rate,
                duration: anchor.end - anchor.start,
              },
            }
          : {}),
        ...(region.border
          ? {
              borderClock: {
                offset: span.sourceStart - anchor.start,
                rate: span.rate,
                duration: anchor.end - anchor.start,
                enter: region.enter,
                exit: region.exit,
              },
            }
          : {}),
        ...(index === spans.length - 1 && region.linkTo
          ? {
              linkTo: region.linkTo,
              ...(region.linkEasing ? { linkEasing: region.linkEasing } : {}),
            }
          : {}),
        id: index === 0 ? region.id : `${region.id}:slice:${index}`,
        start: span.start,
        end: span.end,
        enter: span.enter,
        exit: span.exit,
      };
    });
  });
  const outgoing = new Set<string>();
  const incoming = new Set<string>();
  const visibleIds = new Set(
    active.filter((_region, index) => visible[index]!.length).map(({ id }) => id)
  );
  if (active.some((region) => region.visualAnchor)) {
    for (const region of active) {
      if (!region.linkTo || !visibleIds.has(region.id) || !visibleIds.has(region.linkTo)) continue;
      const link = resolveQuickEditFocusLink(active, region.id, { sourceTime: true });
      if (!link) continue;
      outgoing.add(region.id);
      incoming.add(link.target.id);
    }
  }
  return active.map((region, index) => {
    const slices = visible[index]!;
    return {
      region,
      slices: slices.map((slice, sliceIndex) => {
        const phaseClock = slice.phaseClock;
        const phased =
          phaseClock && (incoming.has(region.id) || outgoing.has(region.id))
            ? {
                ...slice,
                phaseClock: {
                  ...phaseClock,
                  ...(incoming.has(region.id)
                    ? { enter: { type: 'none' as const, duration: 0 } }
                    : {}),
                  ...(outgoing.has(region.id)
                    ? { exit: { type: 'none' as const, duration: 0 } }
                    : {}),
                },
              }
            : slice;
        if (!phased.linkTo) return phased;
        const targetIndex = active.findIndex((target) => target.id === phased.linkTo);
        const targetSlice = visible[targetIndex]?.[0];
        if (sliceIndex !== slices.length - 1 || !targetSlice) {
          const { linkTo: _linkTo, linkEasing: _linkEasing, ...unlinked } = phased;
          return unlinked;
        }
        return { ...phased, linkTo: targetSlice.id };
      }),
    };
  });
}
