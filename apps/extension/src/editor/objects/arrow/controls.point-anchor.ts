import type { Point } from 'fabric';
import { toParentPlanePoint } from './controls.coordinates';
import { readArrowPoints } from './controls-points';
import type { ArrowPathInstance } from './controls.types';
import type { PointLike } from './types';

interface ArrowPointAnchor {
  index: number;
  point: Point;
}

export function readArrowPointAnchor(
  arrow: ArrowPathInstance,
  stored: PointLike[],
  actualIndex: number
): ArrowPointAnchor | null {
  const anchorActualIndex = actualIndex === 0 ? stored.length - 1 : 0;
  const anchorPoint = stored[anchorActualIndex];
  if (!anchorPoint) {
    return null;
  }
  return {
    index: anchorActualIndex === 0 ? 0 : -1,
    point: toParentPlanePoint(arrow, anchorPoint),
  };
}

export function preserveArrowAnchorPosition(
  arrow: ArrowPathInstance,
  anchor: ArrowPointAnchor
): void {
  const updatedPoints = readArrowPoints(arrow);
  const updatedAnchorPoint = anchor.index === 0 ? updatedPoints[0] : updatedPoints.at(-1);
  if (!updatedAnchorPoint) {
    return;
  }

  const diff = toParentPlanePoint(arrow, updatedAnchorPoint).subtract(anchor.point);
  arrow.left = (arrow.left ?? 0) - diff.x;
  arrow.top = (arrow.top ?? 0) - diff.y;
  arrow.setCoords();
  arrow.set('dirty', true);
}
