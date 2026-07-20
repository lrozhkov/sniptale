import type { DrawSession } from '../core/types';
import { getArrowGeometry, isArrowObject } from '../../objects/arrow';
import { getLinePoints, isLineObject } from '../../objects/line';

export function isCompletedDrawSessionTooSmall(
  drawSession: DrawSession,
  minDrawSize: number
): boolean {
  const { tool, object } = drawSession;
  if (!object) {
    return false;
  }
  const bounds = object.getBoundingRect();
  const arrowGeometry = tool === 'arrow' && isArrowObject(object) ? getArrowGeometry(object) : null;
  const linePoints = tool === 'line' && isLineObject(object) ? getLinePoints(object) : null;
  const isArrowTooSmall = arrowGeometry
    ? Math.hypot(
        arrowGeometry.end.x - arrowGeometry.start.x,
        arrowGeometry.end.y - arrowGeometry.start.y
      ) < minDrawSize
    : false;
  const isLineTooSmall =
    linePoints && linePoints.length >= 2
      ? Math.hypot(
          (linePoints.at(-1)?.x ?? 0) - (linePoints[0]?.x ?? 0),
          (linePoints.at(-1)?.y ?? 0) - (linePoints[0]?.y ?? 0)
        ) < minDrawSize
      : false;
  if (linePoints) {
    return isLineTooSmall;
  }

  return (
    isArrowTooSmall ||
    (!arrowGeometry && bounds.width < minDrawSize) ||
    (!arrowGeometry && bounds.height < minDrawSize)
  );
}
