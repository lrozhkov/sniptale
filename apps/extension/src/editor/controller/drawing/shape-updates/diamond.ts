import type { Point } from 'fabric';
import { Polygon } from 'fabric';
import type { DrawSession } from '../../core/types';

export function updateDiamondDraft(drawSession: DrawSession, point: Point): null {
  const { start, object } = drawSession;
  if (!(object instanceof Polygon)) {
    return null;
  }

  const width = Math.abs(point.x - start.x);
  const height = Math.abs(point.y - start.y);
  object.set({
    left: (start.x + point.x) / 2,
    top: (start.y + point.y) / 2,
    points: [
      { x: 0, y: -height / 2 },
      { x: width / 2, y: 0 },
      { x: 0, y: height / 2 },
      { x: -width / 2, y: 0 },
    ],
  });
  return null;
}
