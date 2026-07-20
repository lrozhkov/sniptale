import type { VideoCursorDetectionFrame, VideoCursorDetectionRegion } from './types';

interface StaticPenaltyComponent {
  maxX: number;
  minX: number;
  minY: number;
}

export function resolveDetectionRegion(
  frame: VideoCursorDetectionFrame,
  roi: VideoCursorDetectionRegion | undefined
): VideoCursorDetectionRegion {
  if (!roi) {
    return { height: frame.height, width: frame.width, x: 0, y: 0 };
  }

  const x = Math.max(0, Math.floor(roi.x));
  const y = Math.max(0, Math.floor(roi.y));
  const maxX = Math.min(frame.width, Math.ceil(roi.x + roi.width));
  const maxY = Math.min(frame.height, Math.ceil(roi.y + roi.height));
  return { height: Math.max(0, maxY - y), width: Math.max(0, maxX - x), x, y };
}

export function resolveStaticPenalty(
  frame: VideoCursorDetectionFrame,
  component: StaticPenaltyComponent,
  width: number,
  height: number
): number {
  const isNearCorner = component.minX <= 4 || component.maxX >= frame.width - 4;
  const isTinySymmetric = width <= 12 && height <= 12 && Math.abs(width - height) <= 3;
  if (isTinySymmetric && isNearCorner) {
    return 0.35;
  }
  if (isTinySymmetric) {
    return 0.65;
  }
  return 1;
}
