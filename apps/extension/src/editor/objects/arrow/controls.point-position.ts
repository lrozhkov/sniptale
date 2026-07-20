import { Point, type Control } from 'fabric';
import { toViewportPoint } from './controls.coordinates';
import { resolveArrowEditableControlState } from './controls-target';

export function createArrowPointPositionHandler(displayIndex: number): Control['positionHandler'] {
  return (_dim, _finalMatrix, fabricObject) => {
    const state = resolveArrowEditableControlState(fabricObject);
    if (!state) {
      return new Point(0, 0);
    }

    const point = state.editablePoints[displayIndex];
    return point ? toViewportPoint(state.arrow, point) : new Point(0, 0);
  };
}
