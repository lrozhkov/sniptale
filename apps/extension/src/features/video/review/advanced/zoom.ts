import {
  type QuickEditBorder,
  type QuickEditSpotlight,
} from '../../project/scene/focus-appearance';
import { fitCameraTransitionDurations } from '../../project/motion/transitions';
import {
  parseCameraPerspective as parseQuickEditPerspective,
  parseCameraDepth as parseQuickEditDepth,
} from '../../project/motion/spatial';
import {
  quickEditFocusType,
  quickEditFocusConflicts,
  resolveQuickEditFocusLink,
} from './focus-layout';
import type {
  QuickEditZoomLinkEasing,
  QuickEditZoomRegion,
  QuickEditZoomTransition,
} from './types';

/** Renderer-consistent camera magnification bounds, matching the persisted validation. */
const MIN_CAMERA_SCALE = 1;
const MAX_CAMERA_SCALE = 4;
/** Persisted regions never overlap; this keeps a clamped region valid on its own. */
const MIN_REGION_SECONDS = 0.001;
const DEFAULT_REGION_SECONDS = 2;
const DEFAULT_REGION_SCALE = 1.5;
const DEFAULT_TRANSITION: QuickEditZoomTransition = { type: 'ease-in-out', duration: 0.3 };
const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Fit active phases proportionally without mutating snapshots. Authoring uses source
 * seconds when anchored; projected render consumers must pass their output duration.
 */
export function fitQuickEditZoomTransitions(
  region: QuickEditZoomRegion,
  duration = (region.sourceAnchor ?? region).end - (region.sourceAnchor ?? region).start
): QuickEditZoomRegion {
  const fitted = fitCameraTransitionDurations(region.enter, region.exit, duration);
  return {
    ...region,
    enter: { ...region.enter, duration: fitted.enter },
    exit: { ...region.exit, duration: fitted.exit },
  };
}

/** Single-phase edits reserve the other phase; range edits contract the pair. */
function fitZoomTimingPatch(region: QuickEditZoomRegion, patch: QuickEditZoomRegionPatch) {
  if (Boolean(patch.enter) === Boolean(patch.exit)) return fitQuickEditZoomTransitions(region);
  const phase = patch.enter ? 'enter' : 'exit';
  const other = phase === 'enter' ? 'exit' : 'enter';
  const interval = region.sourceAnchor ?? region;
  const reserved = region[other].type === 'none' ? 0 : region[other].duration;
  const remaining = Math.max(0, interval.end - interval.start - reserved);
  return fitQuickEditZoomTransitions({
    ...region,
    [phase]: { ...region[phase], duration: Math.min(remaining, region[phase].duration) },
  });
}

/** New regions start at the playhead with a sensible default duration and camera. */
export function createQuickEditZoomRegion(args: {
  id: string;
  at: number;
  duration?: number;
  endMax?: number;
  sourceAnchor?: QuickEditZoomRegion['sourceAnchor'];
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
  return fitQuickEditZoomTransitions({
    id: args.id,
    ...(args.sourceAnchor ? { sourceAnchor: args.sourceAnchor } : {}),
    start,
    end: Math.min(start + duration, endMax),
    transform: { scale: DEFAULT_REGION_SCALE, centerX: 0.5, centerY: 0.5 },
    enter: { ...DEFAULT_TRANSITION },
    exit: { ...DEFAULT_TRANSITION },
  });
}

export type QuickEditZoomRegionPatch = {
  cameraFollow?: QuickEditZoomRegion['cameraFollow'] | null;
  followCursor?: boolean;
  perspective?: QuickEditZoomRegion['perspective'];
  depthOfField?: QuickEditZoomRegion['depthOfField'];
  motionBlur?: QuickEditZoomRegion['motionBlur'];
  spotlight?: QuickEditSpotlight | null;
  border?: QuickEditBorder | null;
  start?: number;
  end?: number;
  scale?: number;
  centerX?: number;
  centerY?: number;
  enter?: QuickEditZoomTransition;
  exit?: QuickEditZoomTransition;
  linkTo?: string | null;
  linkEasing?: QuickEditZoomLinkEasing;
};

/** Inspector edits clamp into the persisted contract; timing fields never reorder regions. */
export function updateQuickEditZoomRegion(
  regions: readonly QuickEditZoomRegion[],
  id: string,
  patch: QuickEditZoomRegionPatch
): QuickEditZoomRegion[] {
  if (
    parseQuickEditPerspective(patch.perspective) === null ||
    parseQuickEditDepth(patch.depthOfField) === null
  )
    return [...regions];
  const changesPhases = Boolean(patch.enter || patch.exit);
  const changesTiming = changesPhases || patch.start !== undefined || patch.end !== undefined;
  const updated = regions.map((region) => {
    if (region.id !== id) return region;
    const timing = changesPhases ? fitQuickEditZoomTransitions(region) : region;
    const {
      linkTo: previousLink,
      spotlight: previousSpotlight,
      border: previousBorder,
      cameraFollow: previousCameraFollow,
      ...rest
    } = timing;
    const spotlight = patch.border
      ? undefined
      : patch.spotlight === undefined
        ? previousSpotlight
        : patch.spotlight;
    const border = patch.spotlight
      ? undefined
      : patch.border === undefined
        ? previousBorder
        : patch.border;
    const linkTo = patch.linkTo === undefined ? previousLink : patch.linkTo;
    const cameraFollow =
      patch.cameraFollow === undefined ? previousCameraFollow : patch.cameraFollow;
    const updated = {
      ...rest,
      ...(cameraFollow ? { cameraFollow } : {}),
      ...(patch.followCursor === undefined ? {} : { followCursor: patch.followCursor }),
      ...(patch.perspective ? { perspective: patch.perspective } : {}),
      ...(patch.depthOfField ? { depthOfField: patch.depthOfField } : {}),
      ...(patch.motionBlur ? { motionBlur: normalizeMotionBlur(patch.motionBlur) } : {}),
      ...(spotlight ? { spotlight } : {}),
      ...(border ? { border } : {}),
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
      enter: patch.enter ?? timing.enter,
      exit: patch.exit ?? timing.exit,
      ...(patch.linkEasing === undefined ? {} : { linkEasing: patch.linkEasing }),
    };
    return changesTiming ? fitZoomTimingPatch(updated, patch) : updated;
  });
  const candidate = updated.find((region) => region.id === id);
  if (candidate && quickEditFocusConflicts(updated, candidate)) return [...regions];
  if (patch.linkTo && !resolveQuickEditFocusLink(updated, id, { sourceTime: true }))
    return [...regions];
  return updated.map((region) => {
    if (!region.linkTo) return region;
    const target = updated.find((item) => item.id === region.linkTo);
    // An unrelated edit must not erase a reference whose target was already absent.
    if (
      !target &&
      regions.some((previous) => previous.id === region.id && previous.linkTo === region.linkTo)
    )
      return region;
    if (
      target &&
      quickEditFocusType(region) !== 'border' &&
      quickEditFocusType(target) === quickEditFocusType(region)
    )
      return region;
    const { linkTo: _linkTo, linkEasing: _linkEasing, ...unlinked } = region;
    return unlinked;
  });
}

/**
 * A live outgoing link: the source is active, its stored target is the next active
 * region, and a real gap separates them. Dormant, adjacent-touching, or stale links
 * leave nothing to select or evaluate.
 */
export function resolveQuickEditZoomLink(
  regions: readonly QuickEditZoomRegion[],
  id: string
): { source: QuickEditZoomRegion; target: QuickEditZoomRegion } | null {
  return resolveQuickEditFocusLink(regions, id);
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
  const selected = regions.find((region) => region.id === id);
  regions = regions
    .filter(
      (region) =>
        region.id === id ||
        (selected &&
          quickEditFocusType(selected) === 'zoom' &&
          quickEditFocusType(region) === 'zoom' &&
          !region.dormant)
    )
    .toSorted((a, b) => a.start - b.start);
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
  if (quickEditFocusConflicts(regions, region)) return [...regions];
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
  type?: 'zoom' | 'spotlight' | 'border';
}): { start: number; end: number } | null {
  const preferredLength = args.preferredLength ?? DEFAULT_REGION_SECONDS;
  const active = args.regions
    .filter(
      (region) =>
        !region.dormant && (args.type ?? 'zoom') === 'zoom' && quickEditFocusType(region) === 'zoom'
    )
    .toSorted((a, b) => a.start - b.start)
    .map((region) => {
      const link = resolveQuickEditFocusLink(args.regions, region.id);
      return link ? { ...region, end: link.target.start } : region;
    });
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
  const { active, index, region } = activeQuickEditZoomWindow(args.regions, args.id);
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
  const { active, index, region } = activeQuickEditZoomWindow(args.regions, args.id);
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

function normalizeMotionBlur(value: NonNullable<QuickEditZoomRegion['motionBlur']>) {
  const result: NonNullable<QuickEditZoomRegion['motionBlur']> = {};
  for (const phase of ['enter', 'exit', 'link'] as const) {
    const setting = value[phase];
    if (setting)
      result[phase] = {
        enabled: setting.enabled,
        strength: Number.isFinite(setting.strength) ? clampUnit(setting.strength) : 0,
      };
  }
  return result;
}

function activeQuickEditZoomWindow(regions: readonly QuickEditZoomRegion[], id: string) {
  const selected = regions.find((region) => region.id === id);
  const active = regions
    .filter(
      (region) =>
        region.id === id ||
        (!region.dormant &&
          selected &&
          quickEditFocusType(selected) === 'zoom' &&
          quickEditFocusType(region) === 'zoom')
    )
    .toSorted((a, b) => a.start - b.start);
  const index = active.findIndex((region) => region.id === id);
  return { active, index, region: active[index] };
}
