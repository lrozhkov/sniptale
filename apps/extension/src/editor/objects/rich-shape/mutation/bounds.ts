import {
  resizeRichShapeCalloutGeometry,
  type EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';
import { exportRichShapeDocumentObjectFromGroup } from '../document-export';
import type { RichShapeGroup } from '../types';

export function withNormalizedRichShapeBounds(
  object: RichShapeGroup,
  bounds: { height: number; left: number; top: number; width: number }
): EditorRichShapeDocumentObject {
  const exportedShape = exportRichShapeDocumentObjectFromGroup(object);
  const nextFrame = {
    height: Math.max(1, bounds.height),
    left: bounds.left,
    top: bounds.top,
    width: Math.max(1, bounds.width),
  };
  return {
    ...exportedShape,
    frame: nextFrame,
    scaleX: 1,
    scaleY: 1,
    ...(exportedShape.callout
      ? {
          callout: resizeRichShapeCalloutGeometry(
            exportedShape.callout,
            exportedShape.frame,
            nextFrame
          ),
        }
      : {}),
  };
}

export function resolveFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function resolveRichShapeScale(value: unknown): number {
  const scale = resolveFiniteNumber(value, 1);
  return scale === 0 ? 1 : Math.abs(scale);
}

export function getNormalizedRichShapeFrame(object: RichShapeGroup) {
  const shape = object.sniptaleRichShape;
  return {
    height:
      resolveFiniteNumber(object.height, shape.frame.height) * resolveRichShapeScale(object.scaleY),
    left: resolveFiniteNumber(object.left, shape.frame.left),
    top: resolveFiniteNumber(object.top, shape.frame.top),
    width:
      resolveFiniteNumber(object.width, shape.frame.width) * resolveRichShapeScale(object.scaleX),
  };
}
