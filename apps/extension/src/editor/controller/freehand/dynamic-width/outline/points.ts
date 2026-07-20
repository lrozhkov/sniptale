import type { FreehandPointRecord } from '../../points';
import { isSharpCorner } from '../smoothing';
import type { DynamicStrokePoint } from '../types';
import { buildCapPoints } from './caps';
import { invertNormal, resolveNormal, resolveSegmentNormal, resolveTangent } from './geometry';
import { buildRoundedJoinPoints } from './joins';

export function buildOutlinePoints(points: readonly DynamicStrokePoint[]): FreehandPointRecord[] {
  const left: FreehandPointRecord[] = [];
  const right: FreehandPointRecord[] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];
    const normal = resolveNormal(points, index);
    const radius = Math.max(0.5, point.width / 2);
    if (previous && next && isSharpCorner(previous, point, next)) {
      const incomingNormal = resolveSegmentNormal(previous, point);
      const outgoingNormal = resolveSegmentNormal(point, next);
      left.push(...buildRoundedJoinPoints(point, incomingNormal, outgoingNormal, radius));
      right.push(
        ...buildRoundedJoinPoints(
          point,
          invertNormal(incomingNormal),
          invertNormal(outgoingNormal),
          radius
        )
      );
      return;
    }
    left.push({ x: point.x + normal.x * radius, y: point.y + normal.y * radius });
    right.push({ x: point.x - normal.x * radius, y: point.y - normal.y * radius });
  });
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (!firstPoint || !lastPoint) {
    return [];
  }

  const endTangent = resolveTangent(points, points.length - 1);
  const endAngle = Math.atan2(endTangent.y, endTangent.x);
  const startTangent = resolveTangent(points, 0);
  const startAngle = Math.atan2(startTangent.y, startTangent.x);
  const endCap = buildCapPoints(lastPoint, endAngle + Math.PI / 2, endAngle - Math.PI / 2);
  const startCap = buildCapPoints(
    firstPoint,
    startAngle - Math.PI / 2,
    startAngle - (Math.PI * 3) / 2
  );
  return [...left, ...endCap, ...right.reverse(), ...startCap];
}
