import type { Point } from 'fabric';
import { Ellipse } from 'fabric';
import type { DrawSession } from '../../core/types';

export function updateEllipseDraft(drawSession: DrawSession, point: Point): null {
  const { start, object } = drawSession;
  if (!(object instanceof Ellipse)) {
    return null;
  }

  object.set({
    left: (start.x + point.x) / 2,
    top: (start.y + point.y) / 2,
    rx: Math.abs(point.x - start.x) / 2,
    ry: Math.abs(point.y - start.y) / 2,
  });
  return null;
}
