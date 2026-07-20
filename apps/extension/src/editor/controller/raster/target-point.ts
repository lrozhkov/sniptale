import { type Canvas, type FabricObject, type Point, util } from 'fabric';
import { clampBitmapCoordinate } from './bitmap';
import type { EditorRasterResolvedTarget, EditorRasterTargetSnapshot } from './types';

const BITMAP_EDGE_EPSILON = 0.5;

export function resolveBitmapPoint(args: {
  snapshot: EditorRasterTargetSnapshot;
  canvas: Canvas;
  reference: EditorRasterResolvedTarget['reference'];
  scenePoint: Point;
  targetObject: FabricObject | null;
}): { x: number; y: number } | null {
  if (!args.targetObject) {
    return null;
  }

  const localPoint = util.sendPointToPlane(
    args.scenePoint,
    undefined,
    args.targetObject.calcTransformMatrix()
  );
  const bitmapOffset = resolveBitmapOffset(args.targetObject);
  const bitmapPoint = {
    x: localPoint.x + bitmapOffset.x,
    y: localPoint.y + bitmapOffset.y,
  };
  if (!isPointInsideBitmap(bitmapPoint, args.snapshot.bitmap)) {
    return null;
  }
  return {
    x: clampBitmapCoordinate(bitmapPoint.x, args.snapshot.bitmap.width),
    y: clampBitmapCoordinate(bitmapPoint.y, args.snapshot.bitmap.height),
  };
}

function readObjectDimension(object: FabricObject, axis: 'width' | 'height'): number {
  const value = object[axis];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function resolveBitmapOffset(object: FabricObject): { x: number; y: number } {
  const pathOffset = (object as { pathOffset?: { x?: unknown; y?: unknown } }).pathOffset;
  if (typeof pathOffset?.x === 'number' && typeof pathOffset.y === 'number') {
    return {
      x: pathOffset.x,
      y: pathOffset.y,
    };
  }

  return {
    x: readObjectDimension(object, 'width') / 2,
    y: readObjectDimension(object, 'height') / 2,
  };
}

function isPointInsideBitmap(
  point: { x: number; y: number },
  bitmap: Pick<HTMLCanvasElement, 'width' | 'height'>
): boolean {
  return (
    point.x >= -BITMAP_EDGE_EPSILON &&
    point.y >= -BITMAP_EDGE_EPSILON &&
    point.x <= bitmap.width + BITMAP_EDGE_EPSILON &&
    point.y <= bitmap.height + BITMAP_EDGE_EPSILON
  );
}
