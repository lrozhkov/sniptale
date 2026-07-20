import { measureDistance } from './metrics';
import type { FreehandPointRecord } from './points';

const MIN_TIP_PROGRESS_RATIO = 0.35;
const TIP_DISTANCE_TOLERANCE_RATIO = 0.04;

export function resolveTipIndices(points: readonly FreehandPointRecord[]): number[] {
  const start = points[0]!;
  const minimumTipIndex = Math.floor(points.length * MIN_TIP_PROGRESS_RATIO);
  const tipCandidates = points
    .map((point, index) => ({
      distance: measureDistance(start, point),
      index,
    }))
    .filter(({ index }) => index >= minimumTipIndex);
  const maxDistance = Math.max(...tipCandidates.map(({ distance }) => distance));
  const tolerance = Math.max(2, maxDistance * TIP_DISTANCE_TOLERANCE_RATIO);

  return tipCandidates
    .filter(({ distance }) => maxDistance - distance <= tolerance)
    .map(({ index }) => index);
}
