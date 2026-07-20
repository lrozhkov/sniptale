import {
  buildRectangleVertices,
  measureCentroid,
  measureOrientedBounds,
  measurePolylineError,
} from '../fit-geometry';
import type { ModeledFreehandStroke } from '../modeling';
import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionCandidate } from '../recognition-types';
import { resolveRectangleRotation } from './angles';
import { measureRightAngleScore } from './scoring';

export function buildRectangleCandidate(options: {
  corners: readonly FreehandPointRecord[];
  modeledStroke: ModeledFreehandStroke;
  sharpness: number;
}): FreehandRecognitionCandidate | null {
  const { corners, modeledStroke, sharpness } = options;
  const center = measureCentroid(corners);
  const rotation = resolveRectangleRotation(corners);
  const bounds = measureOrientedBounds(corners, center, rotation);
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const averageSide = (width + height) / 2;
  const isSquare = Math.max(width, height) / Math.max(1, Math.min(width, height)) <= 1.18;
  const vertices = buildRectangleVertices({
    center,
    height: isSquare ? averageSide : height,
    rotation,
    width: isSquare ? averageSide : width,
  });
  const outline = [...vertices, { ...vertices[0]! }];
  const normalizedError =
    measurePolylineError(modeledStroke.points, outline) / Math.max(width, height, 1);
  const rightAngleScore = measureRightAngleScore(corners);
  if (rightAngleScore < 0.7 || normalizedError > 0.18) {
    return null;
  }

  return {
    center,
    confidence: Math.max(0, 0.66 + sharpness * 0.16 + rightAngleScore * 0.12 - normalizedError),
    height: isSquare ? averageSide : height,
    isSquare,
    kind: 'rectangle',
    rotation,
    vertices,
    width: isSquare ? averageSide : width,
  };
}
