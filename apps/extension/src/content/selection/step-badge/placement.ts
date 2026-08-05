import type {
  StepBadgeAnchor,
  StepBadgeBoundarySide,
  StepBadgeManualPlacement,
  StepBadgeOffsetDirection,
  StepBadgeSettings,
  StepBadgeSizeLevel,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { resolveStepBadgeVisualStyle } from '../../../features/highlighter/step-badge-presets/style';

export type StepBadgeFrameRect = { x: number; y: number; width: number; height: number };
type StepBadgePoint = { x: number; y: number };

const SIDE_SWITCH_DEAD_ZONE_PX = 8;
const SIZE_LEVEL_MIN = 0;
const SIZE_LEVEL_MAX = 6;
const SIZE_MULTIPLIER_AT_0 = 1;
const SIZE_MULTIPLIER_AT_3 = 1.35;
const SIZE_MULTIPLIER_AT_6 = 1.8;
const OFFSET_STEP_PX = 8;

const ANCHOR_PLACEMENTS: Record<StepBadgeAnchor, StepBadgeManualPlacement> = {
  'top-left': { position: 0, side: 'top' },
  'top-center': { position: 0.5, side: 'top' },
  'top-right': { position: 1, side: 'top' },
  'middle-left': { position: 0.5, side: 'left' },
  center: { position: 0.5, side: 'top' },
  'middle-right': { position: 0.5, side: 'right' },
  'bottom-left': { position: 0, side: 'bottom' },
  'bottom-center': { position: 0.5, side: 'bottom' },
  'bottom-right': { position: 1, side: 'bottom' },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function getEffectiveSizeLevel(settings: StepBadgeSettings): StepBadgeSizeLevel {
  if (
    settings.sizeLevel !== undefined &&
    settings.sizeLevel >= SIZE_LEVEL_MIN &&
    settings.sizeLevel <= SIZE_LEVEL_MAX
  ) {
    return settings.sizeLevel as StepBadgeSizeLevel;
  }

  if (settings.size === 'standard') return 0;
  if (settings.size === 'extra-large') return 6;
  return 3;
}

function sizeLevelToMultiplier(level: number): number {
  if (level <= 3) {
    return SIZE_MULTIPLIER_AT_0 + (level / 3) * (SIZE_MULTIPLIER_AT_3 - SIZE_MULTIPLIER_AT_0);
  }
  return SIZE_MULTIPLIER_AT_3 + ((level - 3) / 3) * (SIZE_MULTIPLIER_AT_6 - SIZE_MULTIPLIER_AT_3);
}

function getOffsetFromDirections(
  directions: StepBadgeOffsetDirection[] | undefined,
  badgeSize: number
): StepBadgePoint {
  if (!directions || directions.length === 0) return { x: 0, y: 0 };

  const allDirections: StepBadgeOffsetDirection[] = ['up', 'down', 'left', 'right'];
  if (allDirections.every((direction) => directions.includes(direction))) {
    return { x: 0, y: 0 };
  }

  const step = OFFSET_STEP_PX * Math.max(0.5, badgeSize / 24);
  let x = 0;
  let y = 0;
  if (directions.includes('up')) y -= step;
  if (directions.includes('down')) y += step;
  if (directions.includes('left')) x -= step;
  if (directions.includes('right')) x += step;
  return { x, y };
}

export function getStepBadgeVisualMetrics(
  settings: StepBadgeSettings,
  borderWidth: number
): { badgeSize: number; fontSize: number; offset: StepBadgePoint } {
  if (settings.style) {
    const badgeSize = resolveStepBadgeVisualStyle(settings, {
      borderColor: settings.style.backgroundColor,
      borderWidth,
    }).diameter;
    return {
      badgeSize,
      fontSize: badgeSize / 1.8,
      offset: getOffsetFromDirections(settings.offsetDirections, badgeSize),
    };
  }
  const sizeLevel = getEffectiveSizeLevel(settings);
  const fontSize = Math.max(12, borderWidth * 2.5) * sizeLevelToMultiplier(sizeLevel);
  const badgeSize = fontSize * 1.8;
  return {
    badgeSize,
    fontSize,
    offset: getOffsetFromDirections(settings.offsetDirections, badgeSize),
  };
}

function getSideDistance(
  frameRect: StepBadgeFrameRect,
  point: StepBadgePoint,
  side: StepBadgeBoundarySide
): number {
  if (side === 'top') return Math.abs(point.y - frameRect.y);
  if (side === 'right') return Math.abs(point.x - (frameRect.x + frameRect.width));
  if (side === 'bottom') return Math.abs(point.y - (frameRect.y + frameRect.height));
  return Math.abs(point.x - frameRect.x);
}

function getPositionOnSide(
  frameRect: StepBadgeFrameRect,
  point: StepBadgePoint,
  side: StepBadgeBoundarySide
): number {
  const raw =
    side === 'top' || side === 'bottom'
      ? (point.x - frameRect.x) / Math.max(1, frameRect.width)
      : (point.y - frameRect.y) / Math.max(1, frameRect.height);
  return Math.round(clamp(raw, 0, 1) * 10_000) / 10_000;
}

export function getStepBadgeInitialPlacement(
  settings: StepBadgeSettings
): StepBadgeManualPlacement {
  if (settings.manualPlacement) return settings.manualPlacement;
  const anchor = settings.anchor ?? settings.corner ?? 'top-left';
  return ANCHOR_PLACEMENTS[anchor];
}

export function getStepBadgeBoundaryCenter(
  frameRect: StepBadgeFrameRect,
  placement: StepBadgeManualPlacement
): StepBadgePoint {
  const position = clamp(placement.position, 0, 1);
  if (placement.side === 'top') {
    return { x: frameRect.x + frameRect.width * position, y: frameRect.y };
  }
  if (placement.side === 'right') {
    return {
      x: frameRect.x + frameRect.width,
      y: frameRect.y + frameRect.height * position,
    };
  }
  if (placement.side === 'bottom') {
    return {
      x: frameRect.x + frameRect.width * position,
      y: frameRect.y + frameRect.height,
    };
  }
  return { x: frameRect.x, y: frameRect.y + frameRect.height * position };
}

export function projectStepBadgeToFrameBoundary(args: {
  frameRect: StepBadgeFrameRect;
  point: StepBadgePoint;
  previousSide?: StepBadgeBoundarySide;
}): StepBadgeManualPlacement {
  const sides: StepBadgeBoundarySide[] = ['top', 'right', 'bottom', 'left'];
  const distances = sides.map((side) => ({
    distance: getSideDistance(args.frameRect, args.point, side),
    side,
  }));
  distances.sort((a, b) => a.distance - b.distance);
  const nearest = distances[0]?.side ?? 'top';
  const nearestDistance = distances[0]?.distance ?? 0;
  const previousDistance = args.previousSide
    ? getSideDistance(args.frameRect, args.point, args.previousSide)
    : Number.POSITIVE_INFINITY;
  const side =
    args.previousSide && previousDistance <= nearestDistance + SIDE_SWITCH_DEAD_ZONE_PX
      ? args.previousSide
      : nearest;

  return {
    position: getPositionOnSide(args.frameRect, args.point, side),
    side,
  };
}
