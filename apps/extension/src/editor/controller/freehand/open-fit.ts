import { resolveTipIndices } from './arrow-fit';
import { resolveArrowWingPair } from './arrow-wings';
import { measurePolylineError } from './fit-geometry';
import type { ModeledFreehandStroke } from './modeling';
import { measureDistance, measurePathLength } from './metrics';
import type { FreehandPointRecord } from './points';
import type { FreehandRecognitionCandidate } from './recognition-types';

const LINE_DIRECTNESS_THRESHOLD = 0.94;
const MIN_OPEN_CONFIDENCE = 0.66;
const MIN_ARROW_SHAFT_DIRECTNESS = 0.72;

function measureStrokeDirectness(points: readonly FreehandPointRecord[]): number {
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) {
    return 0;
  }

  const pathLength = measurePathLength(points);
  if (pathLength === 0) {
    return 0;
  }

  return measureDistance(start, end) / pathLength;
}

function buildArrowCandidate(options: {
  points: readonly FreehandPointRecord[];
  shaftStart: FreehandPointRecord;
  tipIndex: number;
}): FreehandRecognitionCandidate | null {
  const { points, shaftStart, tipIndex } = options;
  const shaftEnd = points[tipIndex]!;
  const wings = resolveArrowWingPair({
    points,
    shaftEnd,
    shaftStart,
    tipIndex,
  });
  if (!wings) {
    return null;
  }

  const shaftPoints = [...points.slice(0, Math.max(2, wings.headStartIndex)), shaftEnd];
  const shaftDirectness = measureStrokeDirectness(shaftPoints);
  if (shaftDirectness < MIN_ARROW_SHAFT_DIRECTNESS) {
    return null;
  }

  const confidence = Math.max(0, 0.58 + shaftDirectness * 0.18 + wings.symmetry * 0.24);
  return confidence >= MIN_OPEN_CONFIDENCE
    ? {
        confidence,
        head: {
          left: wings.left,
          right: wings.right,
          tip: shaftEnd,
        },
        kind: 'arrow',
        shaft: {
          end: shaftEnd,
          start: shaftStart,
        },
      }
    : null;
}

export function resolveLineCandidate(
  modeledStroke: ModeledFreehandStroke
): FreehandRecognitionCandidate | null {
  const directness = measureStrokeDirectness(modeledStroke.points);
  if (directness < LINE_DIRECTNESS_THRESHOLD) {
    return null;
  }

  const start = modeledStroke.points[0]!;
  const end = modeledStroke.points[modeledStroke.points.length - 1]!;
  const normalizedError =
    measurePolylineError(modeledStroke.points, [start, end]) /
    Math.max(modeledStroke.bounds.width, modeledStroke.bounds.height, 1);
  const confidence = Math.max(0, 0.8 + directness * 0.12 - normalizedError * 0.8);
  return confidence >= MIN_OPEN_CONFIDENCE
    ? {
        confidence,
        kind: 'line',
        shaft: { end, start },
      }
    : null;
}

export function resolveArrowCandidate(
  modeledStroke: ModeledFreehandStroke
): FreehandRecognitionCandidate | null {
  if (modeledStroke.points.length < 5) {
    return null;
  }

  const shaftStart = modeledStroke.points[0]!;
  const tipCandidates = [...new Set(resolveTipIndices(modeledStroke.points))];
  return tipCandidates.reduce<FreehandRecognitionCandidate | null>((bestCandidate, tipIndex) => {
    const candidate = buildArrowCandidate({
      points: modeledStroke.points,
      shaftStart,
      tipIndex,
    });
    if (!candidate) {
      return bestCandidate;
    }

    return !bestCandidate || candidate.confidence > bestCandidate.confidence
      ? candidate
      : bestCandidate;
  }, null);
}
