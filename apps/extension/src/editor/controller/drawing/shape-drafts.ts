import type { Point } from 'fabric';
import { Ellipse, Polygon, Rect } from 'fabric';

export function createRectangleDraft(point: Point): Rect {
  return new Rect({
    left: point.x,
    top: point.y,
    width: 1,
    height: 1,
    originX: 'left',
    originY: 'top',
  });
}

export function createEllipseDraft(point: Point): Ellipse {
  return new Ellipse({
    left: point.x,
    top: point.y,
    rx: 1,
    ry: 1,
    originX: 'center',
    originY: 'center',
  });
}

export function createDiamondDraft(point: Point): Polygon {
  return new Polygon(
    [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ],
    { left: point.x, top: point.y, originX: 'center', originY: 'center' }
  );
}
