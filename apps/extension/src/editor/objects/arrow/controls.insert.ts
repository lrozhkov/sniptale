import { Control, Point } from 'fabric';
import type { EditorArrowSettings } from '../../../features/editor/document/types';
import { clonePoint } from './geometry/points';
import { getStoredArrowPointIndex, readArrowAuthoredPoints } from './controls.helpers';
import { toArrowGeometryPoint, toViewportPoint } from './controls.coordinates';
import { resolveArrowEditableControlState } from './controls-target';
import type { UpdateArrowObject } from './controls.types';
import type { PointLike } from './types';
import { createArrowControlCursorHandler, createArrowControlRender } from './controls.render';

type ArrowInsertTransform = Parameters<Control['actionHandler']>[1] & {
  sniptaleArrowInsertedPointIndex?: number;
};

const ARROW_INSERT_CONTROL_SIZE = 16;
const ARROW_CONTROL_TOUCH_SIZE = 26;

export function createArrowInsertPointControl(
  displayIndex: number,
  controlKey: string,
  updateArrowObject: UpdateArrowObject
): Control {
  return new Control({
    actionName: 'insertArrowPoint',
    sizeX: ARROW_INSERT_CONTROL_SIZE,
    sizeY: ARROW_INSERT_CONTROL_SIZE,
    touchSizeX: ARROW_CONTROL_TOUCH_SIZE,
    touchSizeY: ARROW_CONTROL_TOUCH_SIZE,
    cursorStyle: 'copy',
    cursorStyleHandler: createArrowControlCursorHandler(controlKey, 'copy'),
    positionHandler: createArrowInsertPointPositionHandler(displayIndex),
    actionHandler: createArrowInsertPointActionHandler(displayIndex, updateArrowObject),
    render: createArrowControlRender(controlKey, 'insert'),
  });
}

function createArrowInsertPointPositionHandler(displayIndex: number): Control['positionHandler'] {
  return (_dim, _finalMatrix, fabricObject) => {
    const state = resolveArrowEditableControlState(fabricObject);
    const { arrow, editablePoints } = state!;

    const start = editablePoints[displayIndex];
    const end = editablePoints[displayIndex + 1];
    if (!start || !end) {
      return new Point(0, 0);
    }

    return toViewportPoint(arrow, {
      x: start.x + (end.x - start.x) / 2,
      y: start.y + (end.y - start.y) / 2,
    });
  };
}

function createArrowInsertPointActionHandler(
  displayIndex: number,
  updateArrowObject: UpdateArrowObject
): Control['actionHandler'] {
  return (_eventData, transform, x, y) => {
    const state = resolveArrowEditableControlState(transform.target);
    const { arrow, editablePoints, settings } = state!;
    const stored = readArrowAuthoredPoints(arrow);
    const insertTransform = transform as ArrowInsertTransform;
    const controlPoint = toArrowGeometryPoint(arrow, { x, y });
    const resolvedInsertIndex =
      insertTransform.sniptaleArrowInsertedPointIndex ??
      getArrowInsertStoredIndex(settings, stored, displayIndex, editablePoints.length);
    const insertIndex = Math.min(Math.max(resolvedInsertIndex, 1), stored.length);

    const nextPoints = stored.map(clonePoint);
    if (insertTransform.sniptaleArrowInsertedPointIndex === undefined) {
      nextPoints.splice(insertIndex, 0, controlPoint);
      insertTransform.sniptaleArrowInsertedPointIndex = insertIndex;
    } else {
      nextPoints[insertIndex] = controlPoint;
    }

    updateArrowObject(arrow, { settings, points: nextPoints });
    arrow.setCoords();
    arrow.set('dirty', true);
    return true;
  };
}

function getArrowInsertStoredIndex(
  settings: EditorArrowSettings,
  storedPoints: readonly PointLike[],
  displayIndex: number,
  displayCount: number
): number {
  if (storedPoints.length < 2) {
    return -1;
  }

  const exposeIntermediatePoints = displayCount === storedPoints.length;
  const startIndex = getStoredArrowPointIndex(
    settings,
    storedPoints,
    displayIndex,
    exposeIntermediatePoints
  );
  const endIndex = getStoredArrowPointIndex(
    settings,
    storedPoints,
    displayIndex + 1,
    exposeIntermediatePoints
  );
  return Math.min(Math.max(Math.min(startIndex, endIndex) + 1, 1), storedPoints.length);
}
