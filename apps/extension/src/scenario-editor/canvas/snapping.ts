import type {
  ScenarioElementFrame,
  ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioCanvasResizeHandle } from './types';

const MIN_SNAPPED_SIZE = 24;

function snapValue(value: number, gridSize: number): number {
  if (gridSize <= 0) {
    return value;
  }

  return Math.round(value / gridSize) * gridSize;
}

export function snapScenarioCanvasPoint(point: ScenarioPoint, gridSize: number): ScenarioPoint {
  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}

export function snapScenarioCanvasMoveFrame(
  frame: ScenarioElementFrame,
  gridSize: number
): ScenarioElementFrame {
  return {
    ...frame,
    x: snapValue(frame.x, gridSize),
    y: snapValue(frame.y, gridSize),
  };
}

export function snapScenarioCanvasResizeFrame(args: {
  frame: ScenarioElementFrame;
  gridSize: number;
  handle: ScenarioCanvasResizeHandle;
}): ScenarioElementFrame {
  const right = args.frame.x + args.frame.width;
  const bottom = args.frame.y + args.frame.height;
  const nextLeft = args.handle.includes('w')
    ? snapValue(args.frame.x, args.gridSize)
    : args.frame.x;
  const nextTop = args.handle.includes('n') ? snapValue(args.frame.y, args.gridSize) : args.frame.y;
  const nextRight = args.handle.includes('e') ? snapValue(right, args.gridSize) : right;
  const nextBottom = args.handle.includes('s') ? snapValue(bottom, args.gridSize) : bottom;

  return {
    height: Math.max(MIN_SNAPPED_SIZE, nextBottom - nextTop),
    width: Math.max(MIN_SNAPPED_SIZE, nextRight - nextLeft),
    x: nextLeft,
    y: nextTop,
  };
}
