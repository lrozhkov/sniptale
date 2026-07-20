import {
  MAX_ARROW_HEAD_ANGLE,
  MIN_ARROW_HEAD_ANGLE,
  measureArrowHeadAngle,
  measureSignedDistanceToArrowAxis,
} from './arrow-head';
import { measureDistance } from './metrics';
import type { FreehandPointRecord } from './points';

const ARROW_ANGLE_SYMMETRY_TOLERANCE = Math.PI * 0.24;

function isValidWing(options: {
  headLength: number;
  headSign: number;
  maxHeadLength: number;
  minHeadLength: number;
  wingAngle: number;
}): boolean {
  return !(
    options.headLength < options.minHeadLength ||
    options.headLength > options.maxHeadLength ||
    options.wingAngle < MIN_ARROW_HEAD_ANGLE ||
    options.wingAngle > MAX_ARROW_HEAD_ANGLE ||
    Math.abs(options.headSign) < 0.5
  );
}

export function measureWingSymmetry(options: {
  leftAngle: number;
  leftLength: number;
  rightAngle: number;
  rightLength: number;
}): number {
  const lengthSymmetry =
    Math.min(options.leftLength, options.rightLength) /
    Math.max(options.leftLength, options.rightLength, 1);
  const angleSymmetry = Math.max(
    0,
    1 - Math.abs(options.leftAngle - options.rightAngle) / ARROW_ANGLE_SYMMETRY_TOLERANCE
  );
  return lengthSymmetry * 0.6 + angleSymmetry * 0.4;
}

export function resolveWingMetrics(options: {
  maxHeadLength: number;
  minHeadLength: number;
  shaftEnd: FreehandPointRecord;
  shaftStart: FreehandPointRecord;
  wing: FreehandPointRecord;
}): { angle: number; length: number; sign: number } | null {
  const length = measureDistance(options.wing, options.shaftEnd);
  const angle = measureArrowHeadAngle(options.shaftEnd, options.shaftStart, options.wing);
  const sign = measureSignedDistanceToArrowAxis(options.wing, options.shaftStart, options.shaftEnd);
  return isValidWing({
    headLength: length,
    headSign: sign,
    maxHeadLength: options.maxHeadLength,
    minHeadLength: options.minHeadLength,
    wingAngle: angle,
  })
    ? { angle, length, sign }
    : null;
}
