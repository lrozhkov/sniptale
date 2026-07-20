import type { Control } from 'fabric';
import { getStoredArrowPointIndex } from './controls-offsets/exposure';
import { resolveArrowStoredPointFromControl } from './controls-offsets/reverse';
import { readArrowAuthoredPoints, readArrowPoints } from './controls-points';
import { resolveArrowEditableControlState } from './controls-target';
import { toArrowGeometryPoint } from './controls.coordinates';
import type { UpdateArrowObject } from './controls.types';
import { preserveArrowAnchorPosition, readArrowPointAnchor } from './controls.point-anchor';
import { clonePoint } from './geometry/points';

export function createArrowPointActionHandler(
  displayIndex: number,
  updateArrowObject: UpdateArrowObject
): Control['actionHandler'] {
  return (_eventData, transform, x, y) => {
    const state = resolveArrowEditableControlState(transform.target);
    if (!state) {
      return false;
    }

    const { arrow, editablePoints, settings } = state;
    const rendered = readArrowPoints(arrow);
    const stored = readArrowAuthoredPoints(arrow);
    const actualIndex = getStoredArrowPointIndex(
      settings,
      stored,
      displayIndex,
      editablePoints.length === stored.length
    );
    const controlPoint = toArrowGeometryPoint(arrow, { x, y });
    const nextPoint = resolveArrowStoredPointFromControl(
      settings,
      rendered,
      displayIndex,
      controlPoint
    );
    if (actualIndex < 0 || actualIndex >= stored.length) {
      return false;
    }

    const anchor = readArrowPointAnchor(arrow, stored, actualIndex);
    if (!anchor) {
      return false;
    }

    const nextPoints = stored.map(clonePoint);
    nextPoints[actualIndex] = nextPoint;

    updateArrowObject(arrow, { settings, points: nextPoints });
    preserveArrowAnchorPosition(arrow, anchor);
    return true;
  };
}
