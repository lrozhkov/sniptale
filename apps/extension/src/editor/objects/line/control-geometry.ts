import { Point, util } from 'fabric';
import { getSketchPolylineSegmentPoint } from '../sketch-path';
import { LINE_ROUGH_SEED, shouldRenderRoughLine } from './rough';
import type { LinePathInstance, LinePoint } from './types';

export function toViewportPoint(line: LinePathInstance, point: LinePoint): Point {
  return new Point(point.x - line.pathOffset.x, point.y - line.pathOffset.y).transform(
    util.multiplyTransformMatrices(line.getViewportTransform(), line.calcTransformMatrix())
  );
}

export function toLineGeometryPoint(line: LinePathInstance, point: LinePoint): LinePoint {
  const mouseLocalPosition = util.sendPointToPlane(
    new Point(point.x, point.y),
    undefined,
    line.calcOwnMatrix()
  );
  const nextPoint = mouseLocalPosition.add(line.pathOffset);
  return { x: nextPoint.x, y: nextPoint.y };
}

export function toParentPlanePoint(line: LinePathInstance, point: LinePoint): Point {
  return new Point(point.x, point.y).subtract(line.pathOffset).transform(line.calcOwnMatrix());
}

export function preserveLineAnchorPosition(
  line: LinePathInstance,
  anchorIndex: number,
  anchorBefore: Point
) {
  const nextAnchorPoint =
    line.sniptaleLinePoints[Math.min(anchorIndex, line.sniptaleLinePoints.length - 1)];
  if (!nextAnchorPoint) {
    return;
  }
  const diff = toParentPlanePoint(line, nextAnchorPoint).subtract(anchorBefore);
  line.left = (line.left ?? 0) - diff.x;
  line.top = (line.top ?? 0) - diff.y;
  line.setCoords();
  line.set('dirty', true);
}

function getLineSegmentEndIndex(line: LinePathInstance, startIndex: number): number {
  return startIndex === line.sniptaleLinePoints.length - 1 ? 0 : startIndex + 1;
}

export function getLineSegmentMidpoint(
  line: LinePathInstance,
  startIndex: number
): LinePoint | null {
  const start = line.sniptaleLinePoints[startIndex];
  const end = line.sniptaleLinePoints[getLineSegmentEndIndex(line, startIndex)];
  if (!start || !end) {
    return null;
  }

  if (shouldRenderRoughLine(line.sniptaleLineSettings)) {
    return getSketchPolylineSegmentPoint(
      start,
      end,
      {
        bowing: line.sniptaleLineSettings.bowing ?? 0,
        roughness: line.sniptaleLineSettings.roughness,
        seed: LINE_ROUGH_SEED,
        strokeWidth: line.sniptaleLineSettings.width,
      },
      startIndex,
      0.5
    );
  }

  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}
