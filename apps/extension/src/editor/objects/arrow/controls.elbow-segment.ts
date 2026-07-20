import { Control, Point } from 'fabric';
import { readArrowPoints } from './controls.helpers';
import { resolveArrowEditableControlState } from './controls-target';
import { toArrowGeometryPoint, toViewportPoint } from './controls.coordinates';
import { getElbowSegmentMidpoint, moveElbowSegment } from './elbow';
import type { UpdateArrowObject } from './controls.types';

export function createElbowSegmentControl(
  segmentEndIndex: number,
  updateArrowObject: UpdateArrowObject
): Control {
  return new Control({
    actionName: 'modifyArrowSegment',
    sizeX: 10,
    sizeY: 10,
    cursorStyle: 'move',
    positionHandler: createElbowSegmentPositionHandler(segmentEndIndex),
    actionHandler: createElbowSegmentActionHandler(segmentEndIndex, updateArrowObject),
  });
}

function createElbowSegmentPositionHandler(segmentEndIndex: number): Control['positionHandler'] {
  return (_dim, _finalMatrix, fabricObject) => {
    const arrow = resolveArrowEditableControlState(fabricObject)?.arrow;
    if (!arrow) {
      return new Point(0, 0);
    }

    const point = getElbowSegmentMidpoint(readArrowPoints(arrow), segmentEndIndex);
    return point ? toViewportPoint(arrow, point) : new Point(0, 0);
  };
}

function createElbowSegmentActionHandler(
  segmentEndIndex: number,
  updateArrowObject: UpdateArrowObject
): Control['actionHandler'] {
  return (_eventData, transform, x, y) => {
    const state = resolveArrowEditableControlState(transform.target);
    if (!state) {
      return false;
    }

    const { arrow, settings } = state;
    const storedPoints = readArrowPoints(arrow);
    const controlPoint = toArrowGeometryPoint(arrow, { x, y });
    const nextPoints = moveElbowSegment(storedPoints, segmentEndIndex, controlPoint);
    updateArrowObject(arrow, { settings, points: nextPoints });
    arrow.setCoords();
    arrow.set('dirty', true);
    return true;
  };
}
