import type { Point } from 'fabric';
import {
  createCanvasFrameFromPoints,
  createProportionalCanvasFrameFromPoints,
} from '@sniptale/runtime-contracts/canvas-interactions';
import type { CropSelection } from '../../core/types';

export function createRectDraftBounds(start: Point, point: Point): CropSelection {
  const frame = createCanvasFrameFromPoints(start, point);
  return {
    height: frame.height,
    left: frame.x,
    top: frame.y,
    width: frame.width,
  };
}

export function createProportionalRectDraftBounds(
  start: Point,
  point: Point,
  aspectRatio: number
): CropSelection {
  const frame = createProportionalCanvasFrameFromPoints({
    aspectRatio,
    first: start,
    second: point,
  });

  return {
    height: frame.height,
    left: frame.x,
    top: frame.y,
    width: frame.width,
  };
}

export function createRectangleDraftBounds(
  start: Point,
  point: Point,
  strokeWidth: number
): CropSelection {
  const outerBounds = createRectDraftBounds(start, point);
  const inset = strokeWidth / 2;

  return {
    height: Math.max(1, outerBounds.height - strokeWidth),
    left: outerBounds.left + inset,
    top: outerBounds.top + inset,
    width: Math.max(1, outerBounds.width - strokeWidth),
  };
}
