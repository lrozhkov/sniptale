import type {
  EditorRichShapeCalloutGeometry,
  EditorRichShapeCalloutSide,
  EditorRichShapeDocumentObject,
  EditorRichShapeFrame,
} from './types';
import { isNumber, isRecord } from '@sniptale/runtime-contracts/validation/primitives';

const DEFAULT_BASE_SPAN = 0.22;
const DEFAULT_TAIL_DEPTH_RATIO = 0.28;
const MIN_BASE_GAP = 0.08;
const DEFAULT_SIDE: EditorRichShapeCalloutSide = 'top';

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function isEditorRichShapeCalloutSide(value: unknown): value is EditorRichShapeCalloutSide {
  return value === 'top' || value === 'right' || value === 'bottom' || value === 'left';
}

function createBodyForSide(
  frame: EditorRichShapeFrame,
  side: EditorRichShapeCalloutSide
): EditorRichShapeCalloutGeometry['body'] {
  const rawDepth = Math.max(16, Math.min(frame.width, frame.height) * DEFAULT_TAIL_DEPTH_RATIO);
  const maxDepth =
    side === 'top' || side === 'bottom'
      ? Math.max(0, frame.height - 1)
      : Math.max(0, frame.width - 1);
  const depth = Math.min(rawDepth, maxDepth);
  switch (side) {
    case 'top':
      return { left: 0, top: depth, width: frame.width, height: Math.max(1, frame.height - depth) };
    case 'right':
      return { left: 0, top: 0, width: Math.max(1, frame.width - depth), height: frame.height };
    case 'bottom':
      return { left: 0, top: 0, width: frame.width, height: Math.max(1, frame.height - depth) };
    case 'left':
      return { left: depth, top: 0, width: Math.max(1, frame.width - depth), height: frame.height };
  }
}

function createTipForSide(
  frame: EditorRichShapeFrame,
  side: EditorRichShapeCalloutSide
): EditorRichShapeCalloutGeometry['tail']['tip'] {
  switch (side) {
    case 'top':
      return { x: frame.width / 2, y: 0 };
    case 'right':
      return { x: frame.width, y: frame.height / 2 };
    case 'bottom':
      return { x: frame.width / 2, y: frame.height };
    case 'left':
      return { x: 0, y: frame.height / 2 };
  }
}

export function createDefaultRichShapeCalloutGeometry(
  frame: EditorRichShapeFrame,
  side: EditorRichShapeCalloutSide = DEFAULT_SIDE
): EditorRichShapeCalloutGeometry {
  return {
    body: createBodyForSide(frame, side),
    tail: {
      side,
      baseStartRatio: 0.5 - DEFAULT_BASE_SPAN / 2,
      baseEndRatio: 0.5 + DEFAULT_BASE_SPAN / 2,
      tip: createTipForSide(frame, side),
    },
  };
}

function normalizeBody(
  value: unknown,
  frame: EditorRichShapeFrame,
  side: EditorRichShapeCalloutSide
): EditorRichShapeCalloutGeometry['body'] {
  if (!isRecord(value)) {
    return createBodyForSide(frame, side);
  }

  const left = clamp(isNumber(value['left']) ? value['left'] : 0, 0, Math.max(0, frame.width - 1));
  const top = clamp(isNumber(value['top']) ? value['top'] : 0, 0, Math.max(0, frame.height - 1));
  return {
    left,
    top,
    width: clamp(positive(isNumber(value['width']) ? value['width'] : 0, 1), 1, frame.width - left),
    height: clamp(
      positive(isNumber(value['height']) ? value['height'] : 0, 1),
      1,
      frame.height - top
    ),
  };
}

function normalizeBaseRatios(start: number, end: number) {
  const baseStartRatio = clamp(Math.min(start, end), 0, 1 - MIN_BASE_GAP);
  const baseEndRatio = clamp(Math.max(start, end), MIN_BASE_GAP, 1);
  if (baseEndRatio - baseStartRatio >= MIN_BASE_GAP) {
    return { baseStartRatio, baseEndRatio };
  }

  return {
    baseStartRatio,
    baseEndRatio: clamp(baseStartRatio + MIN_BASE_GAP, MIN_BASE_GAP, 1),
  };
}

export function normalizeRichShapeCalloutGeometry(
  value: unknown,
  frame: EditorRichShapeFrame
): EditorRichShapeCalloutGeometry | undefined {
  if (!isRecord(value) || !isRecord(value['tail'])) {
    return undefined;
  }

  const side = isEditorRichShapeCalloutSide(value['tail']['side'])
    ? value['tail']['side']
    : DEFAULT_SIDE;
  const ratios = normalizeBaseRatios(
    isNumber(value['tail']['baseStartRatio']) ? value['tail']['baseStartRatio'] : 0.39,
    isNumber(value['tail']['baseEndRatio']) ? value['tail']['baseEndRatio'] : 0.61
  );
  const rawTip = isRecord(value['tail']['tip']) ? value['tail']['tip'] : {};
  return {
    body: normalizeBody(value['body'], frame, side),
    tail: {
      side,
      ...ratios,
      tip: {
        x: clamp(isNumber(rawTip['x']) ? rawTip['x'] : frame.width / 2, 0, frame.width),
        y: clamp(isNumber(rawTip['y']) ? rawTip['y'] : frame.height / 2, 0, frame.height),
      },
    },
  };
}

export function resetRichShapeCalloutTail(
  shape: EditorRichShapeDocumentObject,
  side = shape.callout?.tail.side ?? DEFAULT_SIDE
): EditorRichShapeCalloutGeometry {
  return createDefaultRichShapeCalloutGeometry(shape.frame, side);
}

export function switchRichShapeCalloutSide(
  shape: EditorRichShapeDocumentObject,
  side: EditorRichShapeCalloutSide
): EditorRichShapeCalloutGeometry {
  const current = shape.callout ?? createDefaultRichShapeCalloutGeometry(shape.frame);
  const span = current.tail.baseEndRatio - current.tail.baseStartRatio;
  const center = (current.tail.baseStartRatio + current.tail.baseEndRatio) / 2;
  const ratios = normalizeBaseRatios(center - span / 2, center + span / 2);
  return {
    body: createBodyForSide(shape.frame, side),
    tail: {
      side,
      ...ratios,
      tip: createTipForSide(shape.frame, side),
    },
  };
}

export function isDynamicRichShapeCallout(shape: EditorRichShapeDocumentObject): boolean {
  return isRecord(shape.callout) || shape.shapeKind === 'dynamic-callout';
}
