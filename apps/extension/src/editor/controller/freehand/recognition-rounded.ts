import { buildEllipseOutline } from './ellipse-outline';
import {
  measureCentroid,
  measureOrientedBounds,
  measurePolylineError,
  measurePrincipalAxis,
} from './fit-geometry';
import type { ModeledFreehandStroke } from './modeling';
import { detectCornerProfile } from './recognition-corners';
import { MIN_CLOSED_CONFIDENCE } from './recognition-closed-constants';
import type { FreehandRecognitionCandidate } from './recognition-types';

const CIRCLE_ASPECT_RATIO_THRESHOLD = 1.14;

export function resolveRoundedCandidate(
  modeledStroke: ModeledFreehandStroke
): FreehandRecognitionCandidate | null {
  const center = measureCentroid(modeledStroke.sampledPoints);
  const rotation = measurePrincipalAxis(modeledStroke.sampledPoints);
  const bounds = measureOrientedBounds(modeledStroke.sampledPoints, center, rotation);
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const outline = buildEllipseOutline({ center, height, rotation, width });
  const normalizedError =
    measurePolylineError(modeledStroke.points, outline) / Math.max(width, height, 1);
  const cornerProfile = detectCornerProfile(modeledStroke.sampledPoints);
  const cornerPenalty = Math.min(0.28, (cornerProfile?.corners.length ?? 0) * 0.04);
  const sharpnessPenalty = (cornerProfile?.sharpness ?? 0) * 0.16;
  const confidence = Math.max(0, 0.96 - normalizedError * 1.9 - cornerPenalty - sharpnessPenalty);
  if (confidence < MIN_CLOSED_CONFIDENCE) {
    return null;
  }

  const aspectRatio = Math.max(width, height) / Math.max(1, Math.min(width, height));
  if (aspectRatio <= CIRCLE_ASPECT_RATIO_THRESHOLD) {
    const diameter = (width + height) / 2;
    return {
      axes: { major: diameter / 2, minor: diameter / 2 },
      center,
      confidence,
      height: diameter,
      kind: 'circle',
      rotation,
      width: diameter,
    };
  }

  return {
    axes: { major: Math.max(width, height) / 2, minor: Math.min(width, height) / 2 },
    center,
    confidence,
    height,
    kind: 'ellipse',
    rotation,
    width,
  };
}
