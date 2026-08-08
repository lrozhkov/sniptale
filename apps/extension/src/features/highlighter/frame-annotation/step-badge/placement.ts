import type {
  StepBadgeAnchor,
  StepBadgeBoundarySide,
  StepBadgeManualPlacement,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
export { getStepBadgeVisualMetrics } from '../step-badge-metrics';

export type StepBadgeFrameRect = { x: number; y: number; width: number; height: number };
type StepBadgePoint = { x: number; y: number };

const SIDE_SWITCH_DEAD_ZONE_PX = 8;

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
  visualScale?: number;
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
  const sideSwitchDeadZone = SIDE_SWITCH_DEAD_ZONE_PX * (args.visualScale ?? 1);
  const side =
    args.previousSide && previousDistance <= nearestDistance + sideSwitchDeadZone
      ? args.previousSide
      : nearest;

  return {
    position: getPositionOnSide(args.frameRect, args.point, side),
    side,
  };
}
