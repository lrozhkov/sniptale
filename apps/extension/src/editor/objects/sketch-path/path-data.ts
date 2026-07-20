import { formatSketchNumber } from './numeric';
import { buildSketchPolylinePoints } from './sampling';
import type { SketchPoint, SketchPolylineOptions } from './types';

export function buildSketchPolylinePathData(
  points: readonly SketchPoint[],
  options: SketchPolylineOptions
): string {
  const samples = buildSketchPolylinePoints(points, options);
  const start = samples[0];
  if (!start) {
    return 'M 0 0 L 0 0';
  }

  const commands = [`M ${formatSketchNumber(start.x)} ${formatSketchNumber(start.y)}`];
  samples.slice(1).forEach((point) => {
    commands.push(`L ${formatSketchNumber(point.x)} ${formatSketchNumber(point.y)}`);
  });

  return commands.join(' ');
}
