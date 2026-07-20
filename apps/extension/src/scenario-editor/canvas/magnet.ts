import type {
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  createScenarioCanvasFrameGuideLines,
  type ScenarioCanvasGuideAxis,
  type ScenarioCanvasGuideLine,
} from './guide-lines';
import type { ScenarioCanvasResizeHandle } from './types';

const SCENARIO_CANVAS_MAGNET_TOLERANCE = 4;
const MIN_MAGNET_RESIZE_SIZE = 24;

export interface ScenarioCanvasMagnetScope {
  elements: readonly ScenarioElement[];
  slide: {
    height: number;
    width: number;
  };
}

export interface ScenarioCanvasMagnetContext extends ScenarioCanvasMagnetScope {
  activeElementId: string;
}

interface ScenarioCanvasMagnetFrameResult {
  frame: ScenarioElementFrame;
  snapped: boolean;
}

function createReferenceGuideLines(
  context: ScenarioCanvasMagnetContext
): ScenarioCanvasGuideLine[] {
  return [
    ...createScenarioCanvasFrameGuideLines({
      height: context.slide.height,
      width: context.slide.width,
      x: 0,
      y: 0,
    }),
    ...context.elements
      .filter((element) => element.id !== context.activeElementId)
      .flatMap((element) => createScenarioCanvasFrameGuideLines(element.frame)),
  ];
}

function findNearestGuideDelta(
  activeLines: readonly ScenarioCanvasGuideLine[],
  referenceLines: readonly ScenarioCanvasGuideLine[],
  axis: ScenarioCanvasGuideAxis
): number | null {
  let nearest: { delta: number; distance: number } | null = null;

  for (const activeLine of activeLines) {
    if (activeLine.axis !== axis) {
      continue;
    }
    for (const referenceLine of referenceLines) {
      if (referenceLine.axis !== axis) {
        continue;
      }
      const delta = referenceLine.position - activeLine.position;
      const distance = Math.abs(delta);
      if (distance > SCENARIO_CANVAS_MAGNET_TOLERANCE) {
        continue;
      }
      if (!nearest || distance < nearest.distance) {
        nearest = { delta, distance };
      }
    }
  }

  return nearest?.delta ?? null;
}

export function snapScenarioCanvasMoveFrameToMagnet(args: {
  context: ScenarioCanvasMagnetContext;
  frame: ScenarioElementFrame;
}): ScenarioCanvasMagnetFrameResult {
  const activeLines = createScenarioCanvasFrameGuideLines(args.frame);
  const referenceLines = createReferenceGuideLines(args.context);
  const deltaX = findNearestGuideDelta(activeLines, referenceLines, 'vertical');
  const deltaY = findNearestGuideDelta(activeLines, referenceLines, 'horizontal');

  if (deltaX === null && deltaY === null) {
    return { frame: args.frame, snapped: false };
  }

  return {
    frame: {
      ...args.frame,
      x: args.frame.x + (deltaX ?? 0),
      y: args.frame.y + (deltaY ?? 0),
    },
    snapped: true,
  };
}

export function snapScenarioCanvasResizeFrameToMagnet(args: {
  context: ScenarioCanvasMagnetContext;
  frame: ScenarioElementFrame;
  handle: ScenarioCanvasResizeHandle;
}): ScenarioCanvasMagnetFrameResult {
  const referenceLines = createReferenceGuideLines(args.context);
  const deltaX = findNearestGuideDelta(
    getResizeGuideLines(args.frame, args.handle, 'vertical'),
    referenceLines,
    'vertical'
  );
  const deltaY = findNearestGuideDelta(
    getResizeGuideLines(args.frame, args.handle, 'horizontal'),
    referenceLines,
    'horizontal'
  );

  if (deltaX === null && deltaY === null) {
    return { frame: args.frame, snapped: false };
  }

  return {
    frame: applyResizeMagnetDeltas(args.frame, args.handle, {
      x: deltaX ?? 0,
      y: deltaY ?? 0,
    }),
    snapped: true,
  };
}

export function snapScenarioCanvasPointToMagnet(args: {
  context: ScenarioCanvasMagnetContext;
  point: ScenarioPoint;
}): { point: ScenarioPoint; snapped: boolean } {
  const referenceLines = createReferenceGuideLines(args.context);
  const deltaX = findNearestGuideDelta(
    [{ axis: 'vertical', position: args.point.x }],
    referenceLines,
    'vertical'
  );
  const deltaY = findNearestGuideDelta(
    [{ axis: 'horizontal', position: args.point.y }],
    referenceLines,
    'horizontal'
  );

  if (deltaX === null && deltaY === null) {
    return { point: args.point, snapped: false };
  }

  return {
    point: {
      x: args.point.x + (deltaX ?? 0),
      y: args.point.y + (deltaY ?? 0),
    },
    snapped: true,
  };
}

function getResizeGuideLines(
  frame: ScenarioElementFrame,
  handle: ScenarioCanvasResizeHandle,
  axis: ScenarioCanvasGuideAxis
): ScenarioCanvasGuideLine[] {
  if (axis === 'vertical') {
    const position = handle.includes('w') ? frame.x : frame.x + frame.width;
    return [{ axis, position }];
  }

  const position = handle.includes('n') ? frame.y : frame.y + frame.height;
  return [{ axis, position }];
}

function applyResizeMagnetDeltas(
  frame: ScenarioElementFrame,
  handle: ScenarioCanvasResizeHandle,
  delta: ScenarioPoint
): ScenarioElementFrame {
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const nextLeft = handle.includes('w') ? frame.x + delta.x : frame.x;
  const nextTop = handle.includes('n') ? frame.y + delta.y : frame.y;
  const nextRight = handle.includes('e') ? right + delta.x : right;
  const nextBottom = handle.includes('s') ? bottom + delta.y : bottom;

  return {
    height: Math.max(MIN_MAGNET_RESIZE_SIZE, nextBottom - nextTop),
    width: Math.max(MIN_MAGNET_RESIZE_SIZE, nextRight - nextLeft),
    x: nextLeft,
    y: nextTop,
  };
}
