import { clamp } from '../../../document/model';

export interface TaperedDimensions {
  headLength: number;
  headWidth: number;
  shaftEndHalf: number;
  shaftLength: number;
  tailHalf: number;
}

export const TAPERED_HEAD_OUTLINE_POINT_COUNT = 3;
export const TAPERED_SHAFT_SAMPLE_COUNT = 8;

const TAPERED_HEAD_LENGTH_BASE = {
  max: 2.6,
  min: 1.6,
  preferred: 2,
} as const;
const TAPERED_HEAD_LENGTH_RATIO_CAP = 0.38;

export function resolveTaperedDimensions(totalLength: number, width: number): TaperedDimensions {
  const headLengthBase = clamp(
    width * TAPERED_HEAD_LENGTH_BASE.preferred,
    width * TAPERED_HEAD_LENGTH_BASE.min,
    width * TAPERED_HEAD_LENGTH_BASE.max
  );
  const headLength = Math.min(headLengthBase, totalLength * TAPERED_HEAD_LENGTH_RATIO_CAP);
  const headWidth = Math.min(width, headLength / TAPERED_HEAD_LENGTH_BASE.preferred);

  return {
    headLength,
    headWidth,
    shaftEndHalf: headWidth * 0.34,
    shaftLength: Math.max(totalLength - headLength, 0),
    tailHalf: Math.max(1, headWidth * 0.04),
  };
}
