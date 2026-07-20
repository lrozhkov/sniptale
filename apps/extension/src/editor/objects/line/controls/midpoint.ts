import { Control, Path, Point } from 'fabric';
import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import { getLineSegmentMidpoint, toLineGeometryPoint, toViewportPoint } from '../control-geometry';
import { cloneLinePoint } from '../geometry';
import type { LinePathInstance, LinePoint } from '../types';

const LINE_INSERT_ACTION_NAME = 'insertLinePoint';

type UpdateLineObject = (
  line: LinePathInstance,
  options: { settings: EditorLineSettings; points: LinePoint[]; closed?: boolean }
) => void;

type CreateLineControls = (
  line: LinePathInstance,
  updateLineObject: UpdateLineObject
) => Record<string, Control>;

export function createLineMidpointControl(
  segmentStartIndex: number,
  updateLineObject: UpdateLineObject,
  createLineControls: CreateLineControls
): Control {
  let insertedIndex: number | null = null;

  return new Control({
    actionName: LINE_INSERT_ACTION_NAME,
    sizeX: 9,
    sizeY: 9,
    cursorStyle: 'copy',
    positionHandler: (_dim, _finalMatrix, fabricObject) => {
      if (!(fabricObject instanceof Path) || fabricObject.sniptaleType !== 'line') {
        return new Point(0, 0);
      }
      return getLineMidpointViewportPoint(fabricObject as LinePathInstance, segmentStartIndex);
    },
    actionHandler: (_eventData, transform, x, y) =>
      insertLineMidpointControlPoint({
        createLineControls,
        point: { x, y },
        segmentStartIndex,
        setInsertedIndex: (index) => {
          insertedIndex = index;
        },
        target: transform.target,
        updateLineObject,
        insertedIndex,
      }),
  });
}

function getLineMidpointViewportPoint(line: LinePathInstance, segmentStartIndex: number): Point {
  const point = getLineSegmentMidpoint(line, segmentStartIndex);
  return point ? toViewportPoint(line, point) : new Point(0, 0);
}

function insertLineMidpointControlPoint(args: {
  target: unknown;
  point: LinePoint;
  segmentStartIndex: number;
  insertedIndex: number | null;
  setInsertedIndex: (index: number) => void;
  updateLineObject: Parameters<typeof createLineMidpointControl>[1];
  createLineControls: CreateLineControls;
}): boolean {
  if (!(args.target instanceof Path) || args.target.sniptaleType !== 'line') {
    return false;
  }

  const line = args.target as LinePathInstance;
  const points = line.sniptaleLinePoints.map(cloneLinePoint);
  const nextPoint = toLineGeometryPoint(line, args.point);
  const nextInsertedIndex =
    args.insertedIndex === null
      ? Math.min(args.segmentStartIndex + 1, points.length)
      : args.insertedIndex;

  if (args.insertedIndex === null) {
    points.splice(nextInsertedIndex, 0, nextPoint);
    args.setInsertedIndex(nextInsertedIndex);
  } else if (points[nextInsertedIndex]) {
    points[nextInsertedIndex] = nextPoint;
  }

  args.updateLineObject(line, {
    settings: line.sniptaleLineSettings,
    points,
    closed: line.sniptaleLineClosed,
  });
  line.controls = args.createLineControls(line, args.updateLineObject);
  line.set('dirty', true);
  return true;
}
