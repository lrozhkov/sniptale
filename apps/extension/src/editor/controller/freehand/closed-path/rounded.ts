import { buildEllipseOutline } from '../ellipse-outline';
import { measureCentroid, measureOrientedBounds, measurePrincipalAxis } from '../fit-geometry';
import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionCandidate } from '../recognition-types';
import { prepareClosedPath } from './alignment';

function buildCirclePath(center: FreehandPointRecord, diameter: number): FreehandPointRecord[] {
  return buildEllipseOutline({ center, height: diameter, rotation: 0, width: diameter });
}

export function buildRoundedPath(
  candidate: FreehandRecognitionCandidate,
  points: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  const center = candidate.center ?? measureCentroid(points);
  const rotation = candidate.rotation ?? measurePrincipalAxis(points);
  const bounds = measureOrientedBounds(points, center, rotation);
  const width = Math.max(candidate.width ?? bounds.width, 1);
  const height = Math.max(candidate.height ?? bounds.height, 1);
  const outline =
    candidate.kind === 'circle'
      ? buildCirclePath(center, (width + height) / 2)
      : buildEllipseOutline({ center, height, rotation, width });
  return prepareClosedPath(outline, points);
}
