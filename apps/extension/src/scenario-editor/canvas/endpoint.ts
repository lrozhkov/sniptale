import {
  resolveCanvasPointerDelta,
  translateCanvasPoint,
} from '@sniptale/runtime-contracts/canvas-interactions';
import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/v3';
import { snapScenarioCanvasPointToMagnet, type ScenarioCanvasMagnetContext } from './magnet';
import { snapScenarioCanvasPoint } from './snapping';
import type { ScenarioCanvasEndpointHandle, ScenarioCanvasPointPatch } from './types';

export function createEndpointMovePatch(args: {
  end: ScenarioPoint;
  handle: ScenarioCanvasEndpointHandle;
  magnetContext?: ScenarioCanvasMagnetContext | null;
  originClientX: number;
  originClientY: number;
  scale: number;
  snapGridSize?: number | null;
  start: ScenarioPoint;
  targetClientX: number;
  targetClientY: number;
}): ScenarioCanvasPointPatch {
  const delta = resolveCanvasPointerDelta({
    origin: { clientX: args.originClientX, clientY: args.originClientY },
    scale: args.scale,
    target: { clientX: args.targetClientX, clientY: args.targetClientY },
  });

  if (args.handle === 'start') {
    return {
      start: createSnappedEndpointPoint(args.start, delta, {
        magnetContext: args.magnetContext,
        snapGridSize: args.snapGridSize,
      }),
    };
  }

  return {
    end: createSnappedEndpointPoint(args.end, delta, {
      magnetContext: args.magnetContext,
      snapGridSize: args.snapGridSize,
    }),
  };
}

function createSnappedEndpointPoint(
  point: ScenarioPoint,
  delta: ScenarioPoint,
  options: {
    magnetContext: ScenarioCanvasMagnetContext | null | undefined;
    snapGridSize: number | null | undefined;
  }
): ScenarioPoint {
  const nextPoint = translateCanvasPoint(point, delta);
  if (options.magnetContext) {
    const result = snapScenarioCanvasPointToMagnet({
      context: options.magnetContext,
      point: nextPoint,
    });
    if (result.snapped) {
      return result.point;
    }
  }

  return options.snapGridSize
    ? snapScenarioCanvasPoint(nextPoint, options.snapGridSize)
    : nextPoint;
}
