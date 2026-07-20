import {
  resizeCanvasFrameFromHandle,
  resolveCanvasPointerDelta,
} from '@sniptale/runtime-contracts/canvas-interactions';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import { snapScenarioCanvasResizeFrameToMagnet, type ScenarioCanvasMagnetContext } from './magnet';
import { snapScenarioCanvasResizeFrame } from './snapping';
import type { ScenarioCanvasResizeHandle } from './types';

const MIN_SIZE = 24;

export function createElementFrameResizePatch(args: {
  frame: ScenarioElementFrame;
  handle: ScenarioCanvasResizeHandle;
  magnetContext?: ScenarioCanvasMagnetContext | null;
  originClientX: number;
  originClientY: number;
  scale: number;
  snapGridSize?: number | null;
  targetClientX: number;
  targetClientY: number;
}): ScenarioElementFrame {
  const frame = resizeCanvasFrameFromHandle({
    delta: resolveCanvasPointerDelta({
      origin: { clientX: args.originClientX, clientY: args.originClientY },
      scale: args.scale,
      target: { clientX: args.targetClientX, clientY: args.targetClientY },
    }),
    frame: args.frame,
    handle: args.handle,
    minSize: MIN_SIZE,
  });

  if (args.magnetContext) {
    const result = snapScenarioCanvasResizeFrameToMagnet({
      context: args.magnetContext,
      frame,
      handle: args.handle,
    });
    if (result.snapped) {
      return result.frame;
    }
  }

  return args.snapGridSize
    ? snapScenarioCanvasResizeFrame({
        frame,
        gridSize: args.snapGridSize,
        handle: args.handle,
      })
    : frame;
}
