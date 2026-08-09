import { buildDrawingStrokeOutline } from './freehand';
import type { DrawingBounds, DrawingObject, DrawingPoint } from './model';

export type DrawingResizeHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'start'
  | 'end';

const normalizeBounds = (bounds: DrawingBounds): DrawingBounds => ({
  x: bounds.width < 0 ? bounds.x + bounds.width : bounds.x,
  y: bounds.height < 0 ? bounds.y + bounds.height : bounds.y,
  width: Math.abs(bounds.width),
  height: Math.abs(bounds.height),
});

export function createDrawingBounds(start: DrawingPoint, end: DrawingPoint): DrawingBounds {
  return normalizeBounds({
    x: start.x,
    y: start.y,
    width: end.x - start.x,
    height: end.y - start.y,
  });
}

export function getDrawingObjectBounds(object: DrawingObject): DrawingBounds {
  if ('bounds' in object) return normalizeBounds(object.bounds);
  if (object.kind === 'arrow') return createDrawingBounds(object.start, object.end);
  const outline = buildDrawingStrokeOutline(object.samples, object.width, {
    dynamicWidth: object.kind === 'pencil',
  });
  if (outline.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

const containsBounds = (bounds: DrawingBounds, point: DrawingPoint, tolerance: number) =>
  point.x >= bounds.x - tolerance &&
  point.x <= bounds.x + bounds.width + tolerance &&
  point.y >= bounds.y - tolerance &&
  point.y <= bounds.y + bounds.height + tolerance;

function distanceToSegment(point: DrawingPoint, start: DrawingPoint, end: DrawingPoint) {
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) /
        lengthSquared
    )
  );
  return Math.hypot(
    point.x - (start.x + ratio * (end.x - start.x)),
    point.y - (start.y + ratio * (end.y - start.y))
  );
}

export function hitTestDrawingObject(
  object: DrawingObject,
  point: DrawingPoint,
  tolerance = 6
): boolean {
  const bounds = getDrawingObjectBounds(object);
  if (!containsBounds(bounds, point, tolerance)) return false;
  if (object.kind === 'arrow')
    return distanceToSegment(point, object.start, object.end) <= tolerance + 8;
  if (object.kind === 'ellipse') {
    if (bounds.width === 0 || bounds.height === 0) return false;
    const dx = (point.x - (bounds.x + bounds.width / 2)) / (bounds.width / 2);
    const dy = (point.y - (bounds.y + bounds.height / 2)) / (bounds.height / 2);
    return dx * dx + dy * dy <= 1.25;
  }
  return true;
}

export function hitTestDrawingDocument(
  objects: readonly DrawingObject[],
  point: DrawingPoint
): DrawingObject | null {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index]!;
    if (hitTestDrawingObject(object, point)) return object;
  }
  return null;
}

export function translateDrawingObject(object: DrawingObject, delta: DrawingPoint): DrawingObject {
  const move = (point: DrawingPoint) => ({ x: point.x + delta.x, y: point.y + delta.y });
  if (object.kind === 'pencil' || object.kind === 'marker') {
    return {
      ...object,
      samples: object.samples.map((sample) => ({ ...move(sample), t: sample.t })),
    };
  }
  if (object.kind === 'arrow')
    return { ...object, start: move(object.start), end: move(object.end) };
  return { ...object, bounds: { ...object.bounds, ...move(object.bounds) } };
}

export function replaceDrawingObjectBounds(
  object: DrawingObject,
  nextBounds: DrawingBounds
): DrawingObject {
  const previous = getDrawingObjectBounds(object);
  const target = normalizeBounds(nextBounds);
  const scaleX = previous.width === 0 ? 1 : target.width / previous.width;
  const scaleY = previous.height === 0 ? 1 : target.height / previous.height;
  const project = (point: DrawingPoint) => ({
    x: target.x + (point.x - previous.x) * scaleX,
    y: target.y + (point.y - previous.y) * scaleY,
  });
  if (object.kind === 'pencil' || object.kind === 'marker') {
    return {
      ...object,
      samples: object.samples.map((sample) => ({ ...project(sample), t: sample.t })),
    };
  }
  if (object.kind === 'arrow')
    return { ...object, start: project(object.start), end: project(object.end) };
  if (object.kind === 'text') {
    const scale = Math.max(0.25, Math.min(scaleX, scaleY));
    return {
      ...object,
      bounds: target,
      fontSize: Math.max(8, Math.round(object.fontSize * scale)),
    };
  }
  return { ...object, bounds: target };
}
