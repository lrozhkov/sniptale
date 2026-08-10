import { buildDrawingStrokeOutline } from './freehand';
import { buildDrawingArrowOutline, buildDrawingFreehandArrowLines } from './arrow';
import type { DrawingBounds, DrawingObject, DrawingPoint, DrawingShapeObject } from './model';

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

export type DrawingRotationHandle = 'rotate-nw' | 'rotate-ne' | 'rotate-se' | 'rotate-sw';

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
  const outline =
    object.kind === 'arrow'
      ? object.design === 'freehand'
        ? buildDrawingFreehandArrowLines(object).flat()
        : buildDrawingArrowOutline(object)
      : buildDrawingStrokeOutline(object.samples, object.width, {
          dynamicWidth: object.kind === 'pencil',
        });
  if (outline.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function getDrawingObjectRotation(object: DrawingObject): number {
  return object.kind === 'arrow' ? 0 : (object.rotation ?? 0);
}

export function getDrawingObjectSkewX(object: DrawingObject): number {
  return object.kind === 'rectangle' ||
    object.kind === 'ellipse' ||
    object.kind === 'triangle' ||
    object.kind === 'parallelogram'
    ? (object.skewX ?? 0)
    : 0;
}

export function getDrawingBoundsCenter(bounds: DrawingBounds): DrawingPoint {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

export function rotateDrawingPoint(
  point: DrawingPoint,
  center: DrawingPoint,
  rotation: number
): DrawingPoint {
  if (rotation === 0) return point;
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
}

export function transformDrawingObjectVector(
  object: DrawingObject,
  vector: DrawingPoint
): DrawingPoint {
  return rotateDrawingPoint(vector, { x: 0, y: 0 }, getDrawingObjectRotation(object));
}

export function untransformDrawingObjectVector(
  object: DrawingObject,
  vector: DrawingPoint
): DrawingPoint {
  const unrotated = rotateDrawingPoint(vector, { x: 0, y: 0 }, -getDrawingObjectRotation(object));
  return unrotated;
}

export function transformDrawingObjectPoint(
  object: DrawingObject,
  point: DrawingPoint
): DrawingPoint {
  const center = getDrawingBoundsCenter(getDrawingObjectBounds(object));
  const vector = transformDrawingObjectVector(object, {
    x: point.x - center.x,
    y: point.y - center.y,
  });
  return { x: center.x + vector.x, y: center.y + vector.y };
}

export function untransformDrawingObjectPoint(
  object: DrawingObject,
  point: DrawingPoint
): DrawingPoint {
  const center = getDrawingBoundsCenter(getDrawingObjectBounds(object));
  const vector = untransformDrawingObjectVector(object, {
    x: point.x - center.x,
    y: point.y - center.y,
  });
  return { x: center.x + vector.x, y: center.y + vector.y };
}

const containsBounds = (bounds: DrawingBounds, point: DrawingPoint, tolerance: number) =>
  point.x >= bounds.x - tolerance &&
  point.x <= bounds.x + bounds.width + tolerance &&
  point.y >= bounds.y - tolerance &&
  point.y <= bounds.y + bounds.height + tolerance;

export function getDrawingShapeShearOffset(object: DrawingShapeObject): number {
  const bounds = getDrawingObjectBounds(object);
  const requested = Math.tan((getDrawingObjectSkewX(object) * Math.PI) / 180) * bounds.height;
  const maximum = Math.max(0, bounds.width - Math.max(8, object.width * 2));
  return Math.max(-maximum, Math.min(maximum, requested));
}

function getDrawingShapeBaseBounds(object: DrawingShapeObject) {
  const bounds = getDrawingObjectBounds(object);
  const shear = getDrawingShapeShearOffset(object);
  return {
    bounds: {
      x: bounds.x - Math.min(0, shear),
      y: bounds.y,
      width: bounds.width - Math.abs(shear),
      height: bounds.height,
    },
    shear,
  };
}

function shearDrawingShapePoint(point: DrawingPoint, bounds: DrawingBounds, shear: number) {
  const progress = bounds.height === 0 ? 0 : (point.y - bounds.y) / bounds.height;
  return { x: point.x + shear * (1 - progress), y: point.y };
}

export function getDrawingShapePoints(object: Exclude<DrawingShapeObject, { kind: 'ellipse' }>) {
  const geometry = getDrawingShapeBaseBounds(object);
  const { x, y, width, height } = geometry.bounds;
  let points: DrawingPoint[];
  switch (object.kind) {
    case 'triangle':
      points = [
        { x: x + width / 2, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ];
      break;
    case 'parallelogram': {
      const offset = width * 0.22;
      points = [
        { x: x + offset, y },
        { x: x + width, y },
        { x: x + width - offset, y: y + height },
        { x, y: y + height },
      ];
      break;
    }
    case 'rectangle':
      points = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ];
      break;
  }
  return points.map((point) => shearDrawingShapePoint(point, geometry.bounds, geometry.shear));
}

export function getDrawingEllipsePoints(
  object: Extract<DrawingShapeObject, { kind: 'ellipse' }>,
  segments = 64
): DrawingPoint[] {
  const geometry = getDrawingShapeBaseBounds(object);
  const center = getDrawingBoundsCenter(geometry.bounds);
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return shearDrawingShapePoint(
      {
        x: center.x + Math.cos(angle) * (geometry.bounds.width / 2),
        y: center.y + Math.sin(angle) * (geometry.bounds.height / 2),
      },
      geometry.bounds,
      geometry.shear
    );
  });
}

function pointInPolygon(point: DrawingPoint, vertices: readonly DrawingPoint[]): boolean {
  let inside = false;
  for (
    let current = 0, previous = vertices.length - 1;
    current < vertices.length;
    previous = current, current += 1
  ) {
    const currentPoint = vertices[current]!;
    const previousPoint = vertices[previous]!;
    const crosses =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

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
  const localPoint = untransformDrawingObjectPoint(object, point);
  if (!containsBounds(bounds, localPoint, tolerance)) return false;
  if (object.kind === 'arrow') {
    if (object.design === 'freehand') {
      const toleranceWithStroke = Math.max(tolerance, object.width * 0.25);
      return buildDrawingFreehandArrowLines(object).some((line) =>
        line
          .slice(1)
          .some((end, index) => distanceToSegment(point, line[index]!, end) <= toleranceWithStroke)
      );
    }
    return (
      pointInPolygon(point, buildDrawingArrowOutline(object)) ||
      distanceToSegment(point, object.start, object.end) <= tolerance
    );
  }
  if (object.kind === 'ellipse') {
    if (getDrawingObjectSkewX(object) === 0) {
      if (bounds.width === 0 || bounds.height === 0) return false;
      const dx = (localPoint.x - (bounds.x + bounds.width / 2)) / (bounds.width / 2);
      const dy = (localPoint.y - (bounds.y + bounds.height / 2)) / (bounds.height / 2);
      return dx * dx + dy * dy <= 1.25;
    }
    return pointInPolygon(localPoint, getDrawingEllipsePoints(object));
  }
  if (
    object.kind === 'rectangle' ||
    object.kind === 'triangle' ||
    object.kind === 'parallelogram'
  ) {
    return pointInPolygon(localPoint, getDrawingShapePoints(object));
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
  const target = normalizeBounds(nextBounds);
  if (object.kind === 'arrow') {
    const previous = createDrawingBounds(object.start, object.end);
    const scaleX = previous.width === 0 ? 1 : target.width / previous.width;
    const scaleY = previous.height === 0 ? 1 : target.height / previous.height;
    const projectEndpoint = (point: DrawingPoint) => ({
      x: target.x + (point.x - previous.x) * scaleX,
      y: target.y + (point.y - previous.y) * scaleY,
    });
    return { ...object, start: projectEndpoint(object.start), end: projectEndpoint(object.end) };
  }
  const previous = getDrawingObjectBounds(object);
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
  if (object.kind === 'text') {
    return { ...object, bounds: target };
  }
  return { ...object, bounds: target };
}
