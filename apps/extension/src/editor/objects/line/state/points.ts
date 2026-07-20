import { cloneLinePoint, parseLinePointsJson } from '../geometry';
import type { LinePathInstance, LinePoint } from '../types';

export function readLinePoints(line: LinePathInstance): LinePoint[] {
  const parsedPoints = parseLinePointsJson(line.sniptaleLinePointsJson);
  return (parsedPoints ?? line.sniptaleLinePoints ?? []).map(cloneLinePoint);
}
