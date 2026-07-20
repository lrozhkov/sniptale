import type { FreehandPointRecord } from '../../points';
import type { DynamicStrokePoint, DynamicStrokeVector } from '../types';

function normalizeAngleDelta(startAngle: number, endAngle: number): number {
  let delta = endAngle - startAngle;
  while (delta <= -Math.PI) {
    delta += Math.PI * 2;
  }
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  return delta;
}

export function buildRoundedJoinPoints(
  center: DynamicStrokePoint,
  startNormal: DynamicStrokeVector,
  endNormal: DynamicStrokeVector,
  radius: number
): FreehandPointRecord[] {
  const startAngle = Math.atan2(startNormal.y, startNormal.x);
  const delta = normalizeAngleDelta(startAngle, Math.atan2(endNormal.y, endNormal.x));
  const steps = Math.max(2, Math.min(6, Math.ceil(Math.abs(delta) / (Math.PI / 10))));
  const points: FreehandPointRecord[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = startAngle + delta * (step / steps);
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return points;
}
