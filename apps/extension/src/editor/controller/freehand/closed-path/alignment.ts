import { measureSignedPolygonArea } from '../fit-geometry';
import type { FreehandPointRecord } from '../points';

export function alignClosedPathDirection(
  outline: readonly FreehandPointRecord[],
  rawPoints: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  const rawArea = measureSignedPolygonArea(rawPoints.slice(0, -1));
  const outlineArea = measureSignedPolygonArea(outline.slice(0, -1));
  if (rawArea * outlineArea >= 0) {
    return [...outline];
  }

  return [...outline.slice(0, -1).reverse(), outline.at(-1)!];
}

export function alignClosedPathStart(
  outline: readonly FreehandPointRecord[],
  rawStart: FreehandPointRecord
): FreehandPointRecord[] {
  const openOutline = outline.slice(0, -1);
  const startIndex = openOutline.reduce((bestIndex, point, index) => {
    const bestPoint = openOutline[bestIndex]!;
    const bestDistance = Math.hypot(bestPoint.x - rawStart.x, bestPoint.y - rawStart.y);
    const nextDistance = Math.hypot(point.x - rawStart.x, point.y - rawStart.y);
    return nextDistance < bestDistance ? index : bestIndex;
  }, 0);
  const rotated = [...openOutline.slice(startIndex), ...openOutline.slice(0, startIndex)];
  return [...rotated, { ...rotated[0]! }];
}

export function prepareClosedPath(
  outline: readonly FreehandPointRecord[],
  rawPoints: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  const directionAligned = alignClosedPathDirection(outline, rawPoints);
  return alignClosedPathStart(directionAligned, rawPoints[0]!);
}
