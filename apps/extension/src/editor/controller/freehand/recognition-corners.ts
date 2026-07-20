import { measureAngleBetweenVectors, measureDistance } from './metrics';
import { resamplePointCloud } from './point-cloud';
import type { FreehandPointRecord } from './points';

interface FreehandCornerProfile {
  averageTurnAngle: number;
  corners: FreehandPointRecord[];
  sharpness: number;
}

function stripClosingPoint(points: readonly FreehandPointRecord[]): FreehandPointRecord[] {
  if (points.length < 2) {
    return [...points];
  }

  const firstPoint = points[0]!;
  const lastPoint = points[points.length - 1]!;
  return measureDistance(firstPoint, lastPoint) <= 0.001 ? [...points.slice(0, -1)] : [...points];
}

function measureTurnAngle(
  previous: FreehandPointRecord,
  current: FreehandPointRecord,
  next: FreehandPointRecord
): number {
  const leftVector = {
    x: current.x - previous.x,
    y: current.y - previous.y,
  };
  const rightVector = {
    x: next.x - current.x,
    y: next.y - current.y,
  };
  return measureAngleBetweenVectors(leftVector, rightVector);
}

function collectMergedCornerIndices(
  turnAngles: readonly number[],
  sampledPointCount: number
): number[] {
  const candidateIndices = turnAngles
    .map((angle, index) => ({
      angle,
      index,
      next: turnAngles[(index + 1) % turnAngles.length]!,
      previous: turnAngles[(index - 1 + turnAngles.length) % turnAngles.length]!,
    }))
    .filter(({ angle, next, previous }) => angle > 0.72 && angle >= previous && angle > next)
    .map(({ index }) => index);
  const minimumGap = Math.max(2, Math.floor(sampledPointCount / 14));
  const mergedIndices: number[] = [];

  for (const cornerIndex of candidateIndices) {
    const previousCorner = mergedIndices[mergedIndices.length - 1];
    if (previousCorner === undefined || cornerIndex - previousCorner >= minimumGap) {
      mergedIndices.push(cornerIndex);
    }
  }

  if (mergedIndices.length > 1) {
    const firstCorner = mergedIndices[0]!;
    const lastCorner = mergedIndices[mergedIndices.length - 1]!;
    if (firstCorner + sampledPointCount - lastCorner < minimumGap) {
      mergedIndices.pop();
    }
  }

  return mergedIndices;
}

export function detectCornerProfile(
  points: readonly FreehandPointRecord[]
): FreehandCornerProfile | null {
  const openPoints = stripClosingPoint(points);
  if (openPoints.length < 3) {
    return null;
  }

  if (openPoints.length <= 5) {
    const turnAngles = openPoints.map((point, index) =>
      measureTurnAngle(
        openPoints[(index - 1 + openPoints.length) % openPoints.length]!,
        point,
        openPoints[(index + 1) % openPoints.length]!
      )
    );
    const averageTurnAngle =
      turnAngles.reduce((total, angle) => total + angle, 0) / turnAngles.length;

    return {
      averageTurnAngle,
      corners: [...openPoints],
      sharpness: Math.min(1, averageTurnAngle / Math.PI),
    };
  }

  const sampled = resamplePointCloud(openPoints, Math.min(48, Math.max(20, openPoints.length)));
  const turnAngles = sampled.map((_, index) =>
    measureTurnAngle(
      sampled[(index - 2 + sampled.length) % sampled.length]!,
      sampled[index]!,
      sampled[(index + 2) % sampled.length]!
    )
  );
  const cornerIndices = collectMergedCornerIndices(turnAngles, sampled.length);
  const corners = cornerIndices.map((index) => sampled[index]!).filter(Boolean);
  if (corners.length === 0) {
    return null;
  }

  const averageTurnAngle =
    cornerIndices.reduce((total, index) => total + turnAngles[index]!, 0) / cornerIndices.length;
  return {
    averageTurnAngle,
    corners,
    sharpness: Math.min(1, averageTurnAngle / Math.PI),
  };
}
