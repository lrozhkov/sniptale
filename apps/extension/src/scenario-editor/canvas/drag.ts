import {
  resolveCanvasPointerDelta,
  translateCanvasFrame,
} from '@sniptale/runtime-contracts/canvas-interactions';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import { snapScenarioCanvasMoveFrameToMagnet, type ScenarioCanvasMagnetContext } from './magnet';
import { snapScenarioCanvasMoveFrame } from './snapping';

export function createElementFrameMovePatch(args: {
  frame: ScenarioElementFrame;
  magnetContext?: ScenarioCanvasMagnetContext | null;
  originClientX: number;
  originClientY: number;
  scale: number;
  snapGridSize?: number | null;
  targetClientX: number;
  targetClientY: number;
}): ScenarioElementFrame {
  const frame = translateCanvasFrame(
    args.frame,
    resolveCanvasPointerDelta({
      origin: { clientX: args.originClientX, clientY: args.originClientY },
      scale: args.scale,
      target: { clientX: args.targetClientX, clientY: args.targetClientY },
    })
  );

  if (args.magnetContext) {
    const result = snapScenarioCanvasMoveFrameToMagnet({
      context: args.magnetContext,
      frame,
    });
    if (result.snapped) {
      return result.frame;
    }
  }

  return args.snapGridSize ? snapScenarioCanvasMoveFrame(frame, args.snapGridSize) : frame;
}
