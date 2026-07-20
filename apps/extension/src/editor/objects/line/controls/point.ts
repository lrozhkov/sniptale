import { Control, Path, Point } from 'fabric';
import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import {
  preserveLineAnchorPosition,
  toLineGeometryPoint,
  toParentPlanePoint,
  toViewportPoint,
} from '../control-geometry';
import { cloneLinePoint } from '../geometry';
import type { LinePathInstance, LinePoint } from '../types';

const LINE_ACTION_NAME = 'modifyLinePoint';

export function createLinePointControl(
  index: number,
  updateLineObject: (
    line: LinePathInstance,
    options: { settings: EditorLineSettings; points: LinePoint[]; closed?: boolean }
  ) => void
): Control {
  return new Control({
    actionName: LINE_ACTION_NAME,
    sizeX: 13,
    sizeY: 13,
    cursorStyle: 'pointer',
    positionHandler: (_dim, _finalMatrix, fabricObject) => {
      if (!(fabricObject instanceof Path) || fabricObject.sniptaleType !== 'line') {
        return new Point(0, 0);
      }
      const line = fabricObject as LinePathInstance;
      const point = line.sniptaleLinePoints[index];
      return point ? toViewportPoint(line, point) : new Point(0, 0);
    },
    actionHandler: createLinePointActionHandler(index, updateLineObject),
  });
}

function createLinePointActionHandler(
  index: number,
  updateLineObject: (
    line: LinePathInstance,
    options: { settings: EditorLineSettings; points: LinePoint[]; closed?: boolean }
  ) => void
): Control['actionHandler'] {
  return (_eventData, transform, x, y) => {
    const target = transform.target;
    if (!(target instanceof Path) || target.sniptaleType !== 'line') {
      return false;
    }
    return moveLinePoint(target as LinePathInstance, index, { x, y }, updateLineObject);
  };
}

function moveLinePoint(
  line: LinePathInstance,
  index: number,
  point: LinePoint,
  updateLineObject: Parameters<typeof createLinePointActionHandler>[1]
): boolean {
  const points = line.sniptaleLinePoints.map(cloneLinePoint);
  const anchorIndex = index === 0 ? points.length - 1 : 0;
  const anchorPoint = points[anchorIndex];
  if (!points[index] || !anchorPoint) {
    return false;
  }
  const anchorBefore = toParentPlanePoint(line, anchorPoint);
  points[index] = toLineGeometryPoint(line, point);
  updateLineObject(line, {
    settings: line.sniptaleLineSettings,
    points,
    closed: line.sniptaleLineClosed,
  });
  preserveLineAnchorPosition(line, anchorIndex, anchorBefore);
  return true;
}
