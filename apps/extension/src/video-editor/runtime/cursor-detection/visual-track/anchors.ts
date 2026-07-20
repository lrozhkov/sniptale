import type { VideoCursorDetectionAnchor, VideoCursorDetectionCandidate } from './types';

export function findManualAnchor(
  time: number,
  anchors: readonly VideoCursorDetectionAnchor[] | undefined,
  tolerance: number
): VideoCursorDetectionAnchor | null {
  return anchors?.find((anchor) => Math.abs(anchor.time - time) <= tolerance) ?? null;
}

export function createCandidateFromAnchor(
  anchor: VideoCursorDetectionAnchor,
  time: number
): VideoCursorDetectionCandidate {
  const width = anchor.width ?? 1;
  const height = anchor.height ?? 1;
  return {
    area: width * height,
    bounds: { height, width, x: anchor.x, y: anchor.y },
    centerX: anchor.x + width / 2,
    centerY: anchor.y + height / 2,
    confidence: anchor.confidence ?? 1,
    contrastScore: 1,
    height,
    motionScore: 0,
    shapeScore: 1,
    source: 'anchor',
    staticPenalty: 1,
    time,
    width,
    x: anchor.x,
    y: anchor.y,
  };
}
