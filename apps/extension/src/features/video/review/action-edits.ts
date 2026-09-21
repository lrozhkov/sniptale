import { createReviewCut, createReviewSpeed } from './cuts';
import { buildReviewTimeMap, mapReviewAnchor } from './timeline';
import { createQuickEditZoomRegion } from './advanced/zoom';
import type { QuickEditZoomRegion } from './advanced/types';
import type { ReviewEdit } from './types';
import type { ReviewTelemetryMarker } from './telemetry';

/** Action shortcuts use source intervals for edits and result intervals for focus. */
export function planReviewActionEdits(args: {
  marker: ReviewTelemetryMarker;
  duration: number;
  edits: readonly ReviewEdit[];
  regions: readonly QuickEditZoomRegion[];
  boundaries: readonly number[] | undefined;
  snapToKeyframes: boolean;
}) {
  const { marker, duration, edits } = args;
  const segments = buildReviewTimeMap(duration, edits);
  const original = mapReviewAnchor(
    marker.end > marker.start
      ? { kind: 'range', start: marker.start, end: marker.end }
      : { kind: 'point', time: marker.start },
    segments
  );
  const short =
    marker.eventType === 'CLICK' ||
    marker.eventType === 'DOUBLE_CLICK' ||
    marker.end - marker.start < 0.25;
  const start = short ? Math.max(0, Math.min(marker.start - 0.25, duration - 2)) : marker.start;
  const end = short ? Math.min(duration, start + 2) : marker.end;
  const range = { kind: 'range' as const, start, end };
  const mapped = mapReviewAnchor(range, segments);
  const overlapping = edits.some((edit) => edit.start < end && edit.end > start);
  const editArgs = {
    id: 'action-preview',
    selection: range,
    duration,
    edits,
    boundaries: args.boundaries ?? [],
    snapToKeyframes: args.snapToKeyframes,
  };
  const cut = original.excludedFromResult ? null : createReviewCut(editArgs);
  const speed = original.excludedFromResult
    ? null
    : createReviewSpeed({ ...editArgs, rate: 2, audio: 'speed' });
  const focusStart = mapped.ranges[0]?.start;
  const focusEnd = mapped.ranges.at(-1)?.end;
  const removed = original.excludedFromResult;
  const cutOverlap = mapped.partiallyExcluded || mapped.excludedFromResult;
  const occupied =
    focusStart !== undefined &&
    focusEnd !== undefined &&
    args.regions.some(
      (region) => !region.dormant && region.start < focusEnd && region.end > focusStart
    );
  const focus =
    !removed &&
    !cutOverlap &&
    !occupied &&
    focusStart !== undefined &&
    focusEnd !== undefined &&
    focusEnd - focusStart >= 0.001
      ? focusForAction(marker, focusStart, focusEnd)
      : null;
  return {
    range,
    removed,
    cut,
    speed,
    focus,
    editReason: !args.boundaries?.length ? 'loading' : overlapping ? 'overlap' : 'range',
    focusReason: cutOverlap ? 'removed' : occupied ? 'focus-overlap' : 'range',
    contextual: short,
  } as const;
}

function focusForAction(
  marker: ReviewTelemetryMarker,
  start: number,
  end: number
): QuickEditZoomRegion {
  const region = createQuickEditZoomRegion({
    id: 'action-focus',
    at: start,
    duration: end - start,
    endMax: end,
  });
  return {
    ...region,
    transform: {
      scale: marker.eventType === 'CLICK' || marker.eventType === 'DOUBLE_CLICK' ? 2.5 : 1.5,
      centerX: marker.focusPoint?.x ?? 0.5,
      centerY: marker.focusPoint?.y ?? 0.5,
    },
  };
}
