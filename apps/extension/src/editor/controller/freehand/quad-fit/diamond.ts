import { measureCentroid, measurePolylineError } from '../fit-geometry';
import type { ModeledFreehandStroke } from '../modeling';
import { measureDistance } from '../metrics';
import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionCandidate } from '../recognition-types';
import { measureSegmentAngle } from './angles';
import { measureDiamondScore } from './scoring';

export function buildDiamondCandidate(options: {
  corners: readonly FreehandPointRecord[];
  modeledStroke: ModeledFreehandStroke;
  sharpness: number;
}): FreehandRecognitionCandidate | null {
  const { corners, modeledStroke, sharpness } = options;
  const outline = [...corners, { ...corners[0]! }];
  const boundsWidth = measureDistance(corners[1]!, corners[3]!);
  const boundsHeight = measureDistance(corners[0]!, corners[2]!);
  const normalizedError =
    measurePolylineError(modeledStroke.points, outline) / Math.max(boundsWidth, boundsHeight, 1);
  const diamondScore = measureDiamondScore(corners);
  if (diamondScore < 0.7 || normalizedError > 0.2) {
    return null;
  }

  return {
    center: measureCentroid(corners),
    confidence: Math.max(0, 0.62 + sharpness * 0.14 + diamondScore * 0.14 - normalizedError),
    height: boundsHeight,
    kind: 'diamond',
    rotation: measureSegmentAngle(corners[0]!, corners[1]!),
    vertices: [...corners],
    width: boundsWidth,
  };
}
