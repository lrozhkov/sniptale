import type { PointLike } from '../../types';
import { buildOrientedPolygon } from '../heads-geometry';
import {
  buildCircleOutlinePath,
  buildCrosshairCirclePath,
  buildDiamondOutlinePath,
  buildTriangleOutlinePath,
} from '../heads-outline';
import {
  buildDiamondVertices,
  buildTriangleVertices,
  getCircleArrowHeadRadius,
} from '../heads-metrics';
import { circleToPath } from '../points';

export function buildStandardArrowHeadPath(
  type:
    | 'circle'
    | 'circle-outline'
    | 'crosshair-circle'
    | 'diamond'
    | 'diamond-outline'
    | 'triangle'
    | 'triangle-outline',
  point: PointLike,
  angleRad: number,
  width: number,
  size?: number
): string {
  const triangle = buildTriangleVertices(width, size);
  const diamond = buildDiamondVertices(width, size);

  switch (type) {
    case 'triangle':
      return buildOrientedPolygon(triangle, point, angleRad);
    case 'triangle-outline':
      return buildTriangleOutlinePath(triangle, point, angleRad, width);
    case 'diamond':
      return buildOrientedPolygon(diamond, point, angleRad);
    case 'diamond-outline':
      return buildDiamondOutlinePath(diamond, point, angleRad, width);
    case 'circle':
      return circleToPath(point, getCircleArrowHeadRadius(width, size));
    case 'circle-outline':
      return buildCircleOutlinePath(
        point,
        getCircleArrowHeadRadius(width, size),
        Math.max(2, width * 0.5)
      );
    case 'crosshair-circle':
      return buildCrosshairCirclePath(
        point,
        angleRad,
        getCircleArrowHeadRadius(width, size),
        width
      );
  }
}
