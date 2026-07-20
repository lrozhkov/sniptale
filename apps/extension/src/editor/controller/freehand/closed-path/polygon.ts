import { buildDiamondVertices, buildRectangleVertices } from '../fit-geometry';
import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionCandidate } from '../recognition-types';
import { prepareClosedPath } from './alignment';
import { resolveCandidateShapeFrame } from './frame';

export function buildRectanglePath(
  candidate: FreehandRecognitionCandidate,
  points: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  const { center, height, rotation, width } = resolveCandidateShapeFrame(
    candidate,
    points,
    candidate.vertices ?? points
  );
  const squareSide = candidate.isSquare ? (width + height) / 2 : null;
  const vertices =
    candidate.vertices ??
    buildRectangleVertices({
      center,
      height: squareSide ?? height,
      rotation,
      width: squareSide ?? width,
    });
  return prepareClosedPath([...vertices, { ...vertices[0]! }], points);
}

export function buildDiamondPath(
  candidate: FreehandRecognitionCandidate,
  points: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  const { center, height, rotation, width } = resolveCandidateShapeFrame(candidate, points, points);
  const vertices = candidate.vertices ?? buildDiamondVertices({ center, height, rotation, width });
  return prepareClosedPath([...vertices, { ...vertices[0]! }], points);
}

export function buildTrianglePath(
  candidate: FreehandRecognitionCandidate,
  points: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  const vertices =
    candidate.vertices && candidate.vertices.length >= 3
      ? [...candidate.vertices]
      : points.slice(0, 3).map((point) => ({ ...point }));
  return prepareClosedPath([...vertices, { ...vertices[0]! }], points);
}
