import { controlsUtils, type Control } from 'fabric';
import { getArrowControlKey, getEditableArrowPoints, readArrowPoints } from './controls.helpers';
import { createElbowSegmentControl } from './controls.elbow-segment';
import { createArrowInsertPointControl } from './controls.insert';
import { createArrowPointControl } from './controls.point';
import { isElbowInternalSegment } from './elbow';
import { readArrowSettings } from './settings';
import type { ArrowPathInstance, UpdateArrowObject } from './controls.types';
import { hasArrowPointControls, resolveArrowType } from './variant';

export { readArrowSettings } from './settings';
export { readArrowGeometry, readArrowPoints } from './controls.helpers';
export { toArrowGeometryPoint } from './controls.coordinates';

export function createArrowControls(
  arrow: ArrowPathInstance,
  updateArrowObject: UpdateArrowObject
): Record<string, Control> {
  const settings = readArrowSettings(arrow);
  if (!arrow.sniptaleArrowEditMode || !hasArrowPointControls(settings)) {
    return controlsUtils.createObjectDefaultControls();
  }

  const editablePoints = getEditableArrowPoints(arrow, settings);
  const controls: Record<string, Control> = {};

  editablePoints.forEach((_point, index) => {
    const controlKey = getArrowControlKey(index, editablePoints.length);
    controls[controlKey] = createArrowPointControl(
      index,
      editablePoints.length,
      controlKey,
      updateArrowObject
    );
  });

  const arrowType = resolveArrowType(settings.arrowType);
  if (arrowType !== 'elbow') {
    editablePoints.slice(0, -1).forEach((_point, index) => {
      const controlKey = `insert-${index}`;
      controls[controlKey] = createArrowInsertPointControl(index, controlKey, updateArrowObject);
    });
  }

  if (arrowType === 'elbow') {
    const storedPoints = readArrowPoints(arrow);
    storedPoints.forEach((_point, index) => {
      if (isElbowInternalSegment(storedPoints, index)) {
        controls[`segment-${index}`] = createElbowSegmentControl(index, updateArrowObject);
      }
    });
  }

  return controls;
}
