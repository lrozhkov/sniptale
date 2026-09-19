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
  linkTo?: string | null;
};

/** Inspector edits clamp into the persisted contract; timing fields never reorder regions. */
export function updateQuickEditZoomRegion(
  regions: readonly QuickEditZoomRegion[],
  id: string,
  patch: QuickEditZoomRegionPatch
): QuickEditZoomRegion[] {
  return regions.map((region) => {
    if (region.id !== id) return region;
    const { linkTo: previousLink, ...rest } = region;
    const linkTo = patch.linkTo === undefined ? previousLink : patch.linkTo;
    return {
      ...rest,
      ...(linkTo ? { linkTo } : {}),
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

/** A free slot at the playhead; occupied or EOF positions return null (no overlap insertion). */
export function availableQuickEditZoomRange(args: {
  regions: readonly QuickEditZoomRegion[];
  at: number;
  timelineDuration: number;
  preferredLength?: number;
}): { start: number; end: number } | null {
  const preferredLength = args.preferredLength ?? DEFAULT_REGION_SECONDS;
  const active = args.regions.filter((region) => !region.dormant);
  if (
    !Number.isFinite(args.at) ||
    args.at < 0 ||
    args.at >= args.timelineDuration ||
    active.some((region) => args.at >= region.start && args.at < region.end)
  )
    return null;
  const nextStart = active.find((region) => region.start > args.at)?.start ?? args.timelineDuration;
  const end = Math.min(args.at + preferredLength, nextStart, args.timelineDuration);
  return end - args.at >= MIN_REGION_SECONDS ? { start: args.at, end } : null;
}

/** Moves a whole region, preserving its length and the neighbor ordering. */
export function moveQuickEditZoomRegion(args: {
  regions: readonly QuickEditZoomRegion[];
  id: string;
  requestedStart: number;
  timelineDuration: number;
}): { start: number; end: number } {
  // Dormant placements keep unproven values; only active neighbors bound the window.
  const active = args.regions.filter((region) => !region.dormant || region.id === args.id);
  const index = active.findIndex((region) => region.id === args.id);
  const region = active[index];
  if (!region) return { start: args.requestedStart, end: args.requestedStart };
  const length = region.end - region.start;
  const windowStart = index > 0 ? active[index - 1]!.end : 0;
  const windowEnd = index < active.length - 1 ? active[index + 1]!.start : args.timelineDuration;
  const start = Math.max(windowStart, Math.min(args.requestedStart, windowEnd - length));
  return { start, end: start + length };
}

/**
 * Bounded edge trims: trimStart keeps the end fixed, trimEnd keeps the start fixed,
 * and neither edge crosses a neighbor or collapses the region.
 */
export function trimQuickEditZoomRegion(args: {
  regions: readonly QuickEditZoomRegion[];
  id: string;
  edge: 'start' | 'end';
  time: number;
  timelineDuration: number;
}): { start: number; end: number } {
  const active = args.regions.filter((region) => !region.dormant || region.id === args.id);
  const index = active.findIndex((region) => region.id === args.id);
  const region = active[index];
  if (!region) return { start: 0, end: 0 };
  const windowStart = index > 0 ? active[index - 1]!.end : 0;
  const windowEnd = index < active.length - 1 ? active[index + 1]!.start : args.timelineDuration;
  if (args.edge === 'start')
    return {
      start: Math.max(windowStart, Math.min(args.time, region.end - MIN_REGION_SECONDS)),
      end: region.end,
    };
  return {
    start: region.start,
    end: Math.max(region.start + MIN_REGION_SECONDS, Math.min(args.time, windowEnd)),
  };
}
