import type {
  StepBadgeAnchor,
  StepBadgeBoundarySide,
  StepBadgeManualPlacement,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { STEP_BADGE_NORMAL_OFFSET_LIMIT } from '@sniptale/runtime-contracts/highlighter/step-badge';
export { getStepBadgeVisualMetrics } from '../step-badge-metrics';

export type StepBadgeFrameRect = { x: number; y: number; width: number; height: number };
type StepBadgePoint = { x: number; y: number };

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

const STEP_BADGE_BOUNDARY_SNAP_DISTANCE = 8;
const STEP_BADGE_BOUNDARY_SIDES: readonly StepBadgeBoundarySide[] = [
  'top',
  'right',
  'bottom',
  'left',
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function getNormalOffset(
  frameRect: StepBadgeFrameRect,
  point: StepBadgePoint,
  side: StepBadgeBoundarySide
): number {
  const raw =
    side === 'top'
      ? frameRect.y - point.y
      : side === 'right'
        ? point.x - (frameRect.x + frameRect.width)
        : side === 'bottom'
          ? point.y - (frameRect.y + frameRect.height)
          : frameRect.x - point.x;
  if (Math.abs(raw) <= STEP_BADGE_BOUNDARY_SNAP_DISTANCE) return 0;
  return Math.round(clamp(raw, -STEP_BADGE_NORMAL_OFFSET_LIMIT, STEP_BADGE_NORMAL_OFFSET_LIMIT));
}

function getSquaredDistanceToSide(
  frameRect: StepBadgeFrameRect,
  point: StepBadgePoint,
  side: StepBadgeBoundarySide
): number {
  const right = frameRect.x + frameRect.width;
  const bottom = frameRect.y + frameRect.height;
  const boundaryPoint =
    side === 'top'
      ? { x: clamp(point.x, frameRect.x, right), y: frameRect.y }
      : side === 'right'
        ? { x: right, y: clamp(point.y, frameRect.y, bottom) }
        : side === 'bottom'
          ? { x: clamp(point.x, frameRect.x, right), y: bottom }
          : { x: frameRect.x, y: clamp(point.y, frameRect.y, bottom) };
  const deltaX = point.x - boundaryPoint.x;
  const deltaY = point.y - boundaryPoint.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function getClosestBoundarySide(args: {
  frameRect: StepBadgeFrameRect;
  point: StepBadgePoint;
  previousSide?: StepBadgeBoundarySide;
}): StepBadgeBoundarySide {
  const preferredSide = args.previousSide ?? 'top';
  let closestSide = preferredSide;
  let closestDistance = getSquaredDistanceToSide(args.frameRect, args.point, preferredSide);
  for (const side of STEP_BADGE_BOUNDARY_SIDES) {
    if (side === preferredSide) continue;
    const distance = getSquaredDistanceToSide(args.frameRect, args.point, side);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestSide = side;
    }
  }
  return closestSide;
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
  const normalOffset = clamp(
    placement.normalOffset ?? 0,
    -STEP_BADGE_NORMAL_OFFSET_LIMIT,
    STEP_BADGE_NORMAL_OFFSET_LIMIT
  );
  if (placement.side === 'top') {
    return { x: frameRect.x + frameRect.width * position, y: frameRect.y - normalOffset };
  }
  if (placement.side === 'right') {
    return {
      x: frameRect.x + frameRect.width + normalOffset,
      y: frameRect.y + frameRect.height * position,
    };
  }
  if (placement.side === 'bottom') {
    return {
      x: frameRect.x + frameRect.width * position,
      y: frameRect.y + frameRect.height + normalOffset,
    };
  }
  return { x: frameRect.x - normalOffset, y: frameRect.y + frameRect.height * position };
}

export function projectStepBadgeToFrameBoundary(args: {
  frameRect: StepBadgeFrameRect;
  point: StepBadgePoint;
  previousSide?: StepBadgeBoundarySide;
}): StepBadgeManualPlacement {
  const side = getClosestBoundarySide(args);
  const normalOffset = getNormalOffset(args.frameRect, args.point, side);

  return {
    position: getPositionOnSide(args.frameRect, args.point, side),
    side,
    ...(normalOffset === 0 ? {} : { normalOffset }),
  };
}
