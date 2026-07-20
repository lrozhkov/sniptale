import {
  CANVAS_TOOL_MIN_DRAW_SIZE,
  createBoundedCanvasDragFrame,
  createCanvasFrameAtPoint,
  createCanvasFrameFromPoints,
} from '@sniptale/runtime-contracts/canvas-interactions';
import {
  createScenarioArrowElement,
  createScenarioCalloutElement,
  createScenarioCodeElement,
  createScenarioImageElement,
  createScenarioLineElement,
  createScenarioShapeElement,
  createScenarioTextElement,
} from '../../features/scenario/project/v3';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioPoint,
  ScenarioSlideCanvas,
  ScenarioV3ElementKind,
} from '@sniptale/runtime-contracts/scenario/types/v3';

const ELEMENT_CREATORS = {
  [SCENARIO_V3_ELEMENT_KINDS.arrow]: createScenarioArrowElement,
  [SCENARIO_V3_ELEMENT_KINDS.callout]: createScenarioCalloutElement,
  [SCENARIO_V3_ELEMENT_KINDS.code]: createScenarioCodeElement,
  [SCENARIO_V3_ELEMENT_KINDS.image]: createScenarioImageElement,
  [SCENARIO_V3_ELEMENT_KINDS.line]: createScenarioLineElement,
  [SCENARIO_V3_ELEMENT_KINDS.shape]: createScenarioShapeElement,
  [SCENARIO_V3_ELEMENT_KINDS.text]: createScenarioTextElement,
} satisfies Record<ScenarioV3ElementKind, () => ScenarioElement>;

const MIN_DRAWN_FRAME_SIZE = CANVAS_TOOL_MIN_DRAW_SIZE;

export function createInsertedElement(kind: ScenarioV3ElementKind): ScenarioElement {
  return ELEMENT_CREATORS[kind]();
}

export function createInsertedElementAtPoint(args: {
  canvas: ScenarioSlideCanvas;
  kind: ScenarioV3ElementKind;
  point: ScenarioPoint;
}): ScenarioElement {
  const kind = args.kind;
  if (kind === SCENARIO_V3_ELEMENT_KINDS.arrow || kind === SCENARIO_V3_ELEMENT_KINDS.line) {
    return createInsertedConnectorAtPoint({ canvas: args.canvas, kind, point: args.point });
  }

  const element = createInsertedElement(kind);
  return {
    ...element,
    frame: placeFrameInCanvas({
      canvas: args.canvas,
      frame: element.frame,
      point: args.point,
    }),
  } as ScenarioElement;
}

export function createInsertedElementFromDrag(args: {
  canvas: ScenarioSlideCanvas;
  current: ScenarioPoint;
  kind: ScenarioV3ElementKind;
  origin: ScenarioPoint;
}): ScenarioElement {
  const kind = args.kind;
  if (kind === SCENARIO_V3_ELEMENT_KINDS.arrow || kind === SCENARIO_V3_ELEMENT_KINDS.line) {
    return createInsertedConnectorFromDrag({
      canvas: args.canvas,
      current: args.current,
      kind,
      origin: args.origin,
    });
  }

  const frame = normalizeDrawnFrame({
    canvas: args.canvas,
    frame: createCanvasFrameFromPoints(args.origin, args.current),
    origin: args.origin,
  });
  const element = createInsertedElement(kind);
  return { ...element, frame } as ScenarioElement;
}

function createInsertedConnectorAtPoint(args: {
  canvas: ScenarioSlideCanvas;
  kind: typeof SCENARIO_V3_ELEMENT_KINDS.arrow | typeof SCENARIO_V3_ELEMENT_KINDS.line;
  point: ScenarioPoint;
}): ScenarioElement {
  const start = {
    x: clamp(args.point.x, 0, args.canvas.width),
    y: clamp(args.point.y, 0, args.canvas.height),
  };
  const end = {
    x: clamp(start.x + 240, 0, args.canvas.width),
    y: clamp(start.y + 72, 0, args.canvas.height),
  };
  const frame = createConnectorFrame(start, end);

  return args.kind === SCENARIO_V3_ELEMENT_KINDS.arrow
    ? createScenarioArrowElement({ end, frame, start })
    : createScenarioLineElement({ end, frame, start });
}

function createInsertedConnectorFromDrag(args: {
  canvas: ScenarioSlideCanvas;
  current: ScenarioPoint;
  kind: typeof SCENARIO_V3_ELEMENT_KINDS.arrow | typeof SCENARIO_V3_ELEMENT_KINDS.line;
  origin: ScenarioPoint;
}): ScenarioElement {
  const start = clampPointToCanvas(args.origin, args.canvas);
  const rawEnd = clampPointToCanvas(args.current, args.canvas);
  const end =
    Math.abs(rawEnd.x - start.x) < MIN_DRAWN_FRAME_SIZE &&
    Math.abs(rawEnd.y - start.y) < MIN_DRAWN_FRAME_SIZE
      ? {
          x: clamp(start.x + MIN_DRAWN_FRAME_SIZE, 0, args.canvas.width),
          y: clamp(start.y + MIN_DRAWN_FRAME_SIZE, 0, args.canvas.height),
        }
      : rawEnd;
  const frame = createConnectorFrame(start, end);

  return args.kind === SCENARIO_V3_ELEMENT_KINDS.arrow
    ? createScenarioArrowElement({ end, frame, start })
    : createScenarioLineElement({ end, frame, start });
}

function createConnectorFrame(start: ScenarioPoint, end: ScenarioPoint): ScenarioElementFrame {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    height: Math.max(24, Math.abs(end.y - start.y)),
    width: Math.max(24, Math.abs(end.x - start.x)),
    x,
    y,
  };
}

function normalizeDrawnFrame(args: {
  canvas: ScenarioSlideCanvas;
  frame: ScenarioElementFrame;
  origin: ScenarioPoint;
}): ScenarioElementFrame {
  return createBoundedCanvasDragFrame({
    bounds: args.canvas,
    fallbackSize: { height: MIN_DRAWN_FRAME_SIZE, width: MIN_DRAWN_FRAME_SIZE },
    frame: args.frame,
    minSize: MIN_DRAWN_FRAME_SIZE,
    origin: args.origin,
    round: true,
  });
}

function placeFrameInCanvas(args: {
  canvas: ScenarioSlideCanvas;
  frame: ScenarioElementFrame;
  point: ScenarioPoint;
}): ScenarioElementFrame {
  return createCanvasFrameAtPoint({
    anchor: 'top-left',
    bounds: args.canvas,
    point: args.point,
    round: true,
    size: { height: args.frame.height, width: args.frame.width },
  });
}

function clampPointToCanvas(point: ScenarioPoint, canvas: ScenarioSlideCanvas): ScenarioPoint {
  return {
    x: clamp(point.x, 0, canvas.width),
    y: clamp(point.y, 0, canvas.height),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
