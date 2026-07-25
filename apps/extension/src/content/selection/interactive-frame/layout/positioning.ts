import { calculateContentSizeTooltipPosition } from '@sniptale/ui/content-size-tooltip/core';
import {
  calculateFrameFloatingPlacement,
  type FloatingRect,
  type FrameFloatingSide,
} from './floating-placement';

export function calculateInteractiveFrameSizePanelPosition(frameRect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return calculateContentSizeTooltipPosition({ anchorRect: frameRect });
}

export function calculateInteractiveFrameToolbarPosition(
  frameRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  toolbarSize: { width: number; height: number } = { width: 420, height: 50 },
  options?: {
    anchorPoint?: { x: number; y: number };
    preferredSide?: FrameFloatingSide;
    softRects?: FloatingRect[];
    strictRects?: FloatingRect[];
  }
) {
  const preferredSide = options?.anchorPoint
    ? getNearestFrameSide(frameRect, options.anchorPoint)
    : options?.preferredSide;
  const placement = calculateFrameFloatingPlacement({
    ...(options?.anchorPoint === undefined ? {} : { anchorPoint: options.anchorPoint }),
    anchorRect: frameRect,
    avoidanceRect: frameRect,
    size: toolbarSize,
    ...(preferredSide === undefined ? {} : { preferredSide }),
    ...(options?.softRects === undefined ? {} : { softRects: options.softRects }),
    ...(options?.strictRects === undefined ? {} : { strictRects: options.strictRects }),
  });
  return { x: placement.rect.x, y: placement.rect.y, side: placement.side };
}

function getNearestFrameSide(
  frame: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number }
): FrameFloatingSide {
  const distances: Array<{ distance: number; side: FrameFloatingSide }> = [
    { distance: Math.abs(point.y - frame.y), side: 'top' },
    { distance: Math.abs(point.y - (frame.y + frame.height)), side: 'bottom' },
    { distance: Math.abs(point.x - frame.x), side: 'left' },
    { distance: Math.abs(point.x - (frame.x + frame.width)), side: 'right' },
  ];
  distances.sort((a, b) => a.distance - b.distance);
  return distances[0]!.side;
}
