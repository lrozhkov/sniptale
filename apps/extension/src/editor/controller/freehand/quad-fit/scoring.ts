import type { FreehandPointRecord } from '../points';
import { measureDistance } from '../metrics';
import { measureHalfTurnDelta, measureInteriorAngle, measureSegmentAngle } from './angles';

export function measureRightAngleScore(corners: readonly FreehandPointRecord[]): number {
  const averageError =
    corners.reduce((total, corner, index) => {
      const previous = corners[(index - 1 + corners.length) % corners.length]!;
      const next = corners[(index + 1) % corners.length]!;
      return total + Math.abs(measureInteriorAngle(previous, corner, next) - Math.PI / 2);
    }, 0) / corners.length;
  return Math.max(0, 1 - averageError / 0.4);
}

export function measureDiamondScore(corners: readonly FreehandPointRecord[]): number {
  const sideLengths = corners.map((corner, index) =>
    measureDistance(corner, corners[(index + 1) % corners.length]!)
  );
  const minimumSide = Math.max(1, Math.min(...sideLengths));
  const maximumSide = Math.max(...sideLengths);
  const edgeAngles = corners.map((corner, index) =>
    measureSegmentAngle(corner, corners[(index + 1) % corners.length]!)
  );
  const opposingDelta = measureHalfTurnDelta(edgeAngles[0]!, edgeAngles[2]!);
  const nextOpposingDelta = measureHalfTurnDelta(edgeAngles[1]!, edgeAngles[3]!);
  const sideScore = Math.max(0, 1 - (maximumSide / minimumSide - 1) / 0.28);
  const parallelScore = Math.max(0, 1 - (opposingDelta + nextOpposingDelta) / 0.32);
  return sideScore * 0.6 + parallelScore * 0.4;
}
