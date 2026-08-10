import {
  createDrawingBounds,
  getDrawingObjectBounds,
  transformDrawingObjectPoint,
} from './geometry';
import type { DrawingBounds, DrawingObject, DrawingPoint } from './model';

export type DrawingSelectionMode = 'replace' | 'add' | 'toggle';

export function getDrawingObjectSelectionBounds(object: DrawingObject): DrawingBounds {
  const bounds = getDrawingObjectBounds(object);
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => transformDrawingObjectPoint(object, point));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

export function getDrawingSelectionBounds(objects: readonly DrawingObject[]): DrawingBounds | null {
  if (objects.length === 0) return null;
  const bounds = objects.map(getDrawingObjectSelectionBounds);
  const left = Math.min(...bounds.map((candidate) => candidate.x));
  const top = Math.min(...bounds.map((candidate) => candidate.y));
  const right = Math.max(...bounds.map((candidate) => candidate.x + candidate.width));
  const bottom = Math.max(...bounds.map((candidate) => candidate.y + candidate.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function drawingBoundsIntersect(left: DrawingBounds, right: DrawingBounds): boolean {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

export function resolveDrawingMarqueeSelection(args: {
  current: DrawingPoint;
  initialIds: readonly string[];
  mode: DrawingSelectionMode;
  objects: readonly DrawingObject[];
  start: DrawingPoint;
}): readonly string[] {
  const area = createDrawingBounds(args.start, args.current);
  const hitIds = args.objects
    .filter((object) => drawingBoundsIntersect(area, getDrawingObjectSelectionBounds(object)))
    .map((object) => object.id);
  if (args.mode === 'replace') return hitIds;
  const selected = new Set(args.initialIds);
  hitIds.forEach((id) => {
    if (args.mode === 'toggle' && selected.has(id)) selected.delete(id);
    else selected.add(id);
  });
  return args.objects.map((object) => object.id).filter((id) => selected.has(id));
}
