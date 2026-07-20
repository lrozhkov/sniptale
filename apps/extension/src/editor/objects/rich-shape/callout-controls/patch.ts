import { getRichShapeCalloutSidePoint } from '../../../../features/editor/document/rich-shape';
import type {
  EditorRichShapeCalloutGeometry,
  EditorRichShapeDocumentObject,
  EditorRichShapeFrame,
} from '../../../../features/editor/document/rich-shape';
import { clampCalloutControlValue } from './coordinates';

const MIN_BASE_GAP = 0.08;

export function resolveCalloutGeometry(
  object: EditorRichShapeDocumentObject
): EditorRichShapeCalloutGeometry | null {
  return object.callout ?? null;
}

export function getCalloutBasePoint(
  callout: EditorRichShapeCalloutGeometry,
  key: 'baseStart' | 'baseEnd'
): { x: number; y: number } {
  const ratio = key === 'baseStart' ? callout.tail.baseStartRatio : callout.tail.baseEndRatio;
  return getRichShapeCalloutSidePoint(callout.body, callout.tail.side, ratio);
}

function resolveRatioFromPoint(
  callout: EditorRichShapeCalloutGeometry,
  point: { x: number; y: number }
): number {
  const { body, tail } = callout;
  switch (tail.side) {
    case 'top':
    case 'bottom':
      return body.width <= 0 ? 0 : (point.x - body.left) / body.width;
    case 'left':
    case 'right':
      return body.height <= 0 ? 0 : (point.y - body.top) / body.height;
  }
}

export function createCalloutBasePatch(
  callout: EditorRichShapeCalloutGeometry,
  shape: EditorRichShapeDocumentObject,
  key: 'baseStart' | 'baseEnd',
  point: { x: number; y: number }
): EditorRichShapeCalloutGeometry {
  const radius = Math.max(0, shape.style.cornerRadius);
  const axisLength =
    callout.tail.side === 'top' || callout.tail.side === 'bottom'
      ? callout.body.width
      : callout.body.height;
  const cornerGuard = axisLength <= 0 ? 0 : clampCalloutControlValue(radius / axisLength, 0, 0.45);
  const nextRatio = clampCalloutControlValue(
    resolveRatioFromPoint(callout, point),
    cornerGuard,
    1 - cornerGuard
  );
  const baseStartRatio =
    key === 'baseStart'
      ? clampCalloutControlValue(nextRatio, 0, callout.tail.baseEndRatio - MIN_BASE_GAP)
      : callout.tail.baseStartRatio;
  const baseEndRatio =
    key === 'baseEnd'
      ? clampCalloutControlValue(nextRatio, callout.tail.baseStartRatio + MIN_BASE_GAP, 1)
      : callout.tail.baseEndRatio;
  return {
    ...callout,
    tail: {
      ...callout.tail,
      baseStartRatio,
      baseEndRatio,
    },
  };
}

export function createCalloutTipPatch(
  callout: EditorRichShapeCalloutGeometry,
  frame: EditorRichShapeFrame,
  point: { x: number; y: number }
): EditorRichShapeCalloutGeometry {
  return {
    ...callout,
    tail: {
      ...callout.tail,
      tip: {
        x: clampCalloutControlValue(point.x, 0, frame.width),
        y: clampCalloutControlValue(point.y, 0, frame.height),
      },
    },
  };
}
