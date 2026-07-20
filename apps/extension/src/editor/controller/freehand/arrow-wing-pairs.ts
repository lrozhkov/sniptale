import { buildCanonicalArrowHead } from './arrow-head';
import { measureWingSymmetry, resolveWingMetrics } from './arrow-wing-metrics';
import type { FreehandPointRecord } from './points';

const MIN_ARROW_HEAD_SYMMETRY = 0.58;

export interface ArrowWingPair {
  headStartIndex: number;
  left: FreehandPointRecord;
  right: FreehandPointRecord;
  symmetry: number;
}

function buildWingPair(options: {
  leftIndex: number;
  leftSign: number;
  leftWing: FreehandPointRecord;
  rightWing: FreehandPointRecord;
  shaftEnd: FreehandPointRecord;
  shaftStart: FreehandPointRecord;
  symmetry: number;
}): ArrowWingPair {
  const canonicalHead = buildCanonicalArrowHead({
    leftWing: options.leftSign >= 0 ? options.leftWing : options.rightWing,
    rightWing: options.leftSign >= 0 ? options.rightWing : options.leftWing,
    shaftStart: options.shaftStart,
    tip: options.shaftEnd,
  });
  return {
    headStartIndex: options.leftIndex,
    left: canonicalHead.left,
    right: canonicalHead.right,
    symmetry: options.symmetry,
  };
}

export function resolvePairForRightWing(options: {
  leftAngle: number;
  leftIndex: number;
  leftLength: number;
  leftSign: number;
  leftWing: FreehandPointRecord;
  maxHeadLength: number;
  minHeadLength: number;
  rightWing: FreehandPointRecord;
  shaftEnd: FreehandPointRecord;
  shaftStart: FreehandPointRecord;
}): ArrowWingPair | null {
  const rightMetrics = resolveWingMetrics({
    maxHeadLength: options.maxHeadLength,
    minHeadLength: options.minHeadLength,
    shaftEnd: options.shaftEnd,
    shaftStart: options.shaftStart,
    wing: options.rightWing,
  });
  if (!rightMetrics || options.leftSign * rightMetrics.sign >= 0) {
    return null;
  }

  const symmetry = measureWingSymmetry({
    leftAngle: options.leftAngle,
    leftLength: options.leftLength,
    rightAngle: rightMetrics.angle,
    rightLength: rightMetrics.length,
  });
  return symmetry < MIN_ARROW_HEAD_SYMMETRY
    ? null
    : buildWingPair({
        leftIndex: options.leftIndex,
        leftSign: options.leftSign,
        leftWing: options.leftWing,
        rightWing: options.rightWing,
        shaftEnd: options.shaftEnd,
        shaftStart: options.shaftStart,
        symmetry,
      });
}
