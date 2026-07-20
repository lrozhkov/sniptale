import { measureCentroid, measurePolylineError } from './fit-geometry';
import type { ModeledFreehandStroke } from './modeling';
import { resolveQuadCandidate } from './quad-fit/resolve';
import { detectCornerProfile } from './recognition-corners';
import { MIN_CLOSED_CONFIDENCE } from './recognition-closed-constants';
import type { FreehandRecognitionCandidate } from './recognition-types';

function resolveTriangleCandidate(
  modeledStroke: ModeledFreehandStroke,
  corners: readonly { x: number; y: number }[],
  sharpness: number
): FreehandRecognitionCandidate | null {
  const outline = [...corners, { ...corners[0]! }];
  const scale = Math.max(modeledStroke.bounds.width, modeledStroke.bounds.height, 1);
  const normalizedError = measurePolylineError(modeledStroke.points, outline) / scale;
  const confidence = Math.max(0, 0.72 + sharpness * 0.16 - normalizedError * 0.9);
  return confidence >= MIN_CLOSED_CONFIDENCE
    ? {
        center: measureCentroid(corners),
        confidence,
        kind: 'triangle',
        rotation: Math.atan2(corners[1]!.y - corners[0]!.y, corners[1]!.x - corners[0]!.x),
        vertices: [...corners],
      }
    : null;
}

export function resolveAngularCandidate(
  modeledStroke: ModeledFreehandStroke
): FreehandRecognitionCandidate | null {
  const cornerSourcePoints =
    modeledStroke.centerline.length <= 8 ? modeledStroke.centerline : modeledStroke.sampledPoints;
  const cornerProfile = detectCornerProfile(cornerSourcePoints);
  if (!cornerProfile) {
    return null;
  }

  if (cornerProfile.corners.length === 3 && cornerProfile.sharpness >= 0.54) {
    return resolveTriangleCandidate(modeledStroke, cornerProfile.corners, cornerProfile.sharpness);
  }

  if (cornerProfile.corners.length === 4 && cornerProfile.sharpness >= 0.32) {
    return resolveQuadCandidate({
      corners: cornerProfile.corners,
      modeledStroke,
      sharpness: cornerProfile.sharpness,
    });
  }

  return null;
}
