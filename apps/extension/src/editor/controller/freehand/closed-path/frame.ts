import { measureCentroid, measureOrientedBounds, measurePrincipalAxis } from '../fit-geometry';
import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionCandidate } from '../recognition-types';

export function resolveCandidateShapeFrame(
  candidate: FreehandRecognitionCandidate,
  points: readonly FreehandPointRecord[],
  centerPoints: readonly FreehandPointRecord[]
) {
  const center = candidate.center ?? measureCentroid(centerPoints);
  const rotation = candidate.rotation ?? measurePrincipalAxis(points);
  const fallbackBounds = measureOrientedBounds(points, center, rotation);
  return {
    center,
    height: Math.max(candidate.height ?? fallbackBounds.height, 1),
    rotation,
    width: Math.max(candidate.width ?? fallbackBounds.width, 1),
  };
}
