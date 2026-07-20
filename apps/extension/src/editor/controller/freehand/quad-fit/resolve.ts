import { orderVerticesClockwise } from '../fit-geometry';
import type { ModeledFreehandStroke } from '../modeling';
import type { FreehandPointRecord } from '../points';
import type { FreehandRecognitionCandidate } from '../recognition-types';
import { buildDiamondCandidate } from './diamond';
import { buildRectangleCandidate } from './rectangle';

export function resolveQuadCandidate(options: {
  corners: readonly FreehandPointRecord[];
  modeledStroke: ModeledFreehandStroke;
  sharpness: number;
}): FreehandRecognitionCandidate | null {
  const orderedCorners = orderVerticesClockwise(options.corners);
  return (
    buildRectangleCandidate({
      corners: orderedCorners,
      modeledStroke: options.modeledStroke,
      sharpness: options.sharpness,
    }) ??
    buildDiamondCandidate({
      corners: orderedCorners,
      modeledStroke: options.modeledStroke,
      sharpness: options.sharpness,
    })
  );
}
