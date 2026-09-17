import type { QuickEditZoomRegion, QuickEditZoomTransition } from './types';

/** Renderer-consistent camera magnification bounds, matching the persisted validation. */
const MIN_CAMERA_SCALE = 1;
const MAX_CAMERA_SCALE = 4;
/** Persisted regions never overlap; this keeps a clamped region valid on its own. */
const MIN_REGION_SECONDS = 0.001;
const DEFAULT_REGION_SECONDS = 2;
const DEFAULT_REGION_SCALE = 1.5;
const DEFAULT_TRANSITION: QuickEditZoomTransition = { type: 'ease-in-out', duration: 0.3 };
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/** New regions start at the playhead with a sensible default duration and camera. */
export function createQuickEditZoomRegion(args: {
  id: string;
  at: number;
  duration?: number;
  endMax?: number;
}): QuickEditZoomRegion {
  const endMax = args.endMax ?? Infinity;
  const duration = Math.max(
    MIN_REGION_SECONDS,
    Math.min(
      args.duration ?? DEFAULT_REGION_SECONDS,
      Math.max(MIN_REGION_SECONDS, endMax - args.at)
    )
  );
  const start = args.at;
  return {
    id: args.id,
    start,
    end: Math.min(start + duration, endMax),
    transform: { scale: DEFAULT_REGION_SCALE, centerX: 0.5, centerY: 0.5 },
    enter: { ...DEFAULT_TRANSITION },
    exit: { ...DEFAULT_TRANSITION },
  };
}

export type QuickEditZoomRegionPatch = {
  start?: number;
  end?: number;
  scale?: number;
  centerX?: number;
  centerY?: number;
  enter?: QuickEditZoomTransition;
  exit?: QuickEditZoomTransition;
};

/** Inspector edits clamp into the persisted contract; timing fields never reorder regions. */
export function updateQuickEditZoomRegion(
  regions: readonly QuickEditZoomRegion[],
  id: string,
  patch: QuickEditZoomRegionPatch
): QuickEditZoomRegion[] {
  return regions.map((region) => {
    if (region.id !== id) return region;
    return {
      ...region,
      ...(patch.start === undefined ? {} : { start: Math.max(0, patch.start) }),
      ...(patch.end === undefined ? {} : { end: Math.max(0, patch.end) }),
      transform: {
        scale: Math.max(
          MIN_CAMERA_SCALE,
          Math.min(MAX_CAMERA_SCALE, patch.scale ?? region.transform.scale)
        ),
        centerX: clampUnit(patch.centerX ?? region.transform.centerX),
        centerY: clampUnit(patch.centerY ?? region.transform.centerY),
      },
      ...(patch.enter === undefined ? {} : { enter: patch.enter }),
      ...(patch.exit === undefined ? {} : { exit: patch.exit }),
    };
  });
}

/**
 * Free boundary updates stay between the neighbors so persisted regions never overlap;
 * adjacency at both window edges stays allowed for transition handovers.
 */
export function clampQuickEditZoomRegion(
  regions: readonly QuickEditZoomRegion[],
  id: string,
  start: number,
  end: number
): { start: number; end: number } {
  const index = regions.findIndex((region) => region.id === id);
  if (index < 0) return { start, end };
  const windowStart = index > 0 ? regions[index - 1]!.end : 0;
  const windowEnd =
    index < regions.length - 1 ? regions[index + 1]!.start : Number.MAX_SAFE_INTEGER;
  const clampedStart = Math.max(start, windowStart);
  const clampedEnd = Math.min(end, windowEnd);
  return {
    start: clampedStart,
    end: Math.max(clampedEnd, clampedStart + MIN_REGION_SECONDS),
  };
}

/** Keeps the persisted list ascending so the evaluator can hand over at boundaries. */
export function insertQuickEditZoomRegion(
  regions: readonly QuickEditZoomRegion[],
  region: QuickEditZoomRegion
): QuickEditZoomRegion[] {
  const index = regions.findIndex((item) => item.start > region.start);
  if (index < 0) return [...regions, region];
  return [...regions.slice(0, index), region, ...regions.slice(index)];
}
