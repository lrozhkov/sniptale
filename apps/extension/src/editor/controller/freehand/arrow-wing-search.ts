import { measureDistance } from './metrics';
import type { FreehandPointRecord } from './points';
import {
  resolvePairForRightWing,
  resolveWingMetrics,
  type ArrowWingPair,
} from './arrow-wing-candidates';

const MAX_HEAD_LENGTH_RATIO = 0.45;
const MIN_HEAD_LENGTH_RATIO = 0.05;

function resolveSearchWindow(points: readonly FreehandPointRecord[], tipIndex: number) {
  return {
    searchEnd: Math.min(points.length - 1, tipIndex + Math.max(3, Math.ceil(points.length * 0.22))),
    searchStart: Math.max(1, tipIndex - Math.max(4, Math.ceil(points.length * 0.3))),
  };
}

function resolveRightWingPair(options: {
  leftAngle: number;
  leftIndex: number;
  leftLength: number;
  leftSign: number;
  leftWing: FreehandPointRecord;
  maxHeadLength: number;
  minHeadLength: number;
  points: readonly FreehandPointRecord[];
  searchEnd: number;
  shaftEnd: FreehandPointRecord;
  shaftStart: FreehandPointRecord;
  tipIndex: number;
}): ArrowWingPair | null {
  let bestPair: ArrowWingPair | null = null;

  for (let rightIndex = options.tipIndex + 1; rightIndex <= options.searchEnd; rightIndex += 1) {
    const pair = resolvePairForRightWing({
      leftAngle: options.leftAngle,
      leftIndex: options.leftIndex,
      leftLength: options.leftLength,
      leftSign: options.leftSign,
      leftWing: options.leftWing,
      maxHeadLength: options.maxHeadLength,
      minHeadLength: options.minHeadLength,
      rightWing: options.points[rightIndex]!,
      shaftEnd: options.shaftEnd,
      shaftStart: options.shaftStart,
    });
    if (pair && (!bestPair || pair.symmetry > bestPair.symmetry)) {
      bestPair = pair;
    }
  }

  return bestPair;
}

export function resolveArrowWingPair(options: {
  points: readonly FreehandPointRecord[];
  shaftEnd: FreehandPointRecord;
  shaftStart: FreehandPointRecord;
  tipIndex: number;
}): ArrowWingPair | null {
  const { points, shaftEnd, shaftStart, tipIndex } = options;
  const shaftLength = Math.max(measureDistance(shaftStart, shaftEnd), 1);
  const minHeadLength = shaftLength * MIN_HEAD_LENGTH_RATIO;
  const maxHeadLength = shaftLength * MAX_HEAD_LENGTH_RATIO;
  const { searchEnd, searchStart } = resolveSearchWindow(points, tipIndex);
  let bestPair: ArrowWingPair | null = null;

  for (let leftIndex = searchStart; leftIndex < tipIndex; leftIndex += 1) {
    const leftWing = points[leftIndex]!;
    const leftMetrics = resolveWingMetrics({
      maxHeadLength,
      minHeadLength,
      shaftEnd,
      shaftStart,
      wing: leftWing,
    });
    if (!leftMetrics) {
      continue;
    }

    const pair = resolveRightWingPair({
      leftAngle: leftMetrics.angle,
      leftIndex,
      leftLength: leftMetrics.length,
      leftSign: leftMetrics.sign,
      leftWing,
      maxHeadLength,
      minHeadLength,
      points,
      searchEnd,
      shaftEnd,
      shaftStart,
      tipIndex,
    });
    if (pair && (!bestPair || pair.symmetry > bestPair.symmetry)) {
      bestPair = pair;
    }
  }

  return bestPair;
}
