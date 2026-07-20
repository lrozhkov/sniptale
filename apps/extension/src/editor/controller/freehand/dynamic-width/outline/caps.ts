import type { FreehandPointRecord } from '../../points';
import type { DynamicStrokePoint } from '../types';

export function buildCapPoints(
  center: DynamicStrokePoint,
  startAngle: number,
  endAngle: number
): FreehandPointRecord[] {
  const radius = Math.max(0.5, center.width / 2);
  const capPoints: FreehandPointRecord[] = [];
  const steps = 12;
  for (let step = 1; step < steps; step += 1) {
    const ratio = step / steps;
    const angle = startAngle + (endAngle - startAngle) * ratio;
    capPoints.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return capPoints;
}
