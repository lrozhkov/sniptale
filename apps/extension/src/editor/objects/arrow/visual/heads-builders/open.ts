import type { PointLike } from '../../types';
import { getOpenArrowHeadLength, buildExcalidrawArrowheadArmEnds } from '../heads-metrics';
import { rotatePoint, translatePoint } from '../points';

const OPEN_HEAD_THICKNESS_MULTIPLIER = 0.72;

export function buildOpenArrowHeadPath(
  point: PointLike,
  angleRad: number,
  width: number,
  size?: number
): string {
  const arms = buildExcalidrawArrowheadArmEnds(getOpenArrowHeadLength(width, size));
  const thickness = Math.max(2.2, width * OPEN_HEAD_THICKNESS_MULTIPLIER);

  return [
    buildRoundedChevronArmPath(arms[0], thickness, point, angleRad),
    buildRoundedChevronArmPath(arms[1], thickness, point, angleRad),
  ].join(' ');
}

function buildRoundedChevronArmPath(
  end: PointLike,
  thickness: number,
  point: PointLike,
  angleRad: number
): string {
  const length = Math.hypot(end.x, end.y);
  if (length === 0) {
    return '';
  }

  const half = thickness / 2;
  const unit = {
    x: end.x / length,
    y: end.y / length,
  };
  const normal = {
    x: -unit.y,
    y: unit.x,
  };
  const orient = (local: PointLike) => translatePoint(rotatePoint(local, angleRad), point);
  const tipUpper = orient(clampChevronTipPoint({ x: normal.x * half, y: normal.y * half }));
  const tipLower = orient(clampChevronTipPoint({ x: -normal.x * half, y: -normal.y * half }));
  const endUpper = orient({
    x: end.x + normal.x * half,
    y: end.y + normal.y * half,
  });
  const endLower = orient({
    x: end.x - normal.x * half,
    y: end.y - normal.y * half,
  });
  const endCap = orient({
    x: end.x + unit.x * half,
    y: end.y + unit.y * half,
  });
  const tipCap = orient({ x: 0, y: 0 });

  return [
    `M ${tipUpper.x} ${tipUpper.y}`,
    `L ${endUpper.x} ${endUpper.y}`,
    `Q ${endCap.x} ${endCap.y} ${endLower.x} ${endLower.y}`,
    `L ${tipLower.x} ${tipLower.y}`,
    `Q ${tipCap.x} ${tipCap.y} ${tipUpper.x} ${tipUpper.y}`,
    'Z',
  ].join(' ');
}

function clampChevronTipPoint(point: PointLike): PointLike {
  return {
    x: Math.min(0, point.x),
    y: point.y,
  };
}
