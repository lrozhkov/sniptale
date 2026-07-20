import type { FreehandPointRecord } from '../points';
import type { FreehandStrokeSample } from '../samples';
import type { PositionedFreehandPath } from './types';

export function translatePointsToObjectPosition(
  object: PositionedFreehandPath,
  points: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  const offsetX = object.pathOffset?.x;
  const offsetY = object.pathOffset?.y;
  if (
    typeof object.left !== 'number' ||
    typeof object.top !== 'number' ||
    typeof offsetX !== 'number' ||
    typeof offsetY !== 'number'
  ) {
    return [...points];
  }

  const translateX = object.left - offsetX;
  const translateY = object.top - offsetY;
  return points.map((point) => ({
    x: point.x + translateX,
    y: point.y + translateY,
  }));
}

export function translateSamplesToObjectPosition(
  object: PositionedFreehandPath,
  samples: readonly FreehandStrokeSample[] | null
): FreehandStrokeSample[] | null {
  if (!samples) {
    return null;
  }

  const translatedPoints = translatePointsToObjectPosition(object, samples);
  return samples.map((sample, index) => {
    const point = translatedPoints[index] ?? sample;
    return { t: sample.t, x: point.x, y: point.y };
  });
}
