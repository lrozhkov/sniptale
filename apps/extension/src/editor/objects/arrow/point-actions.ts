import { readArrowPoints, readArrowSettings, toArrowGeometryPoint } from './controls';
import type { ArrowPathInstance } from './controls.types';
import { insertArrowPointGeometry } from './point-edit/insert';
import { removeArrowPointGeometry } from './point-edit/remove';
import {
  getArrowPointRemovalIndex,
  getArrowPointRemovalIndexByDistance,
} from './point-edit/removal-index';
import type { PointLike } from './types';
import { getEffectiveArrowMode, hasArrowCurvePointEditing, hasArrowPointControls } from './variant';
import { updateArrowObject } from './object';

export function insertArrowPoint(arrow: ArrowPathInstance, point: PointLike): void {
  const geometryPoint = toArrowGeometryPoint(arrow, point);
  const settings = readArrowSettings(arrow);
  const currentPoints: PointLike[] = readArrowPoints(arrow);
  insertArrowPointGeometry(arrow, settings, currentPoints, geometryPoint, updateArrowObject);
}

export function removeArrowPoint(arrow: ArrowPathInstance, point: PointLike): boolean {
  const settings = readArrowSettings(arrow);
  if (!hasArrowPointControls(settings) || getEffectiveArrowMode(settings) !== 'curve') {
    return false;
  }

  const currentPoints: PointLike[] = readArrowPoints(arrow);
  if (currentPoints.length < 3) {
    return false;
  }

  const geometryPoint = toArrowGeometryPoint(arrow, point);
  const pointIndex = getArrowPointRemovalIndexByDistance(settings, currentPoints, geometryPoint);
  return pointIndex === -1
    ? false
    : removeArrowPointGeometry(arrow, settings, currentPoints, pointIndex, updateArrowObject);
}

export function setArrowEditMode(arrow: ArrowPathInstance, editMode: boolean): void {
  arrow.sniptaleArrowEditMode = editMode;
  updateArrowObject(arrow, {});
}

export function updateArrowPointOnDoubleClick(arrow: ArrowPathInstance, point: PointLike): void {
  const settings = readArrowSettings(arrow);
  if (!hasArrowPointControls(settings) || !hasArrowCurvePointEditing(settings)) {
    return;
  }

  if (!arrow.sniptaleArrowEditMode) {
    setArrowEditMode(arrow, true);
    return;
  }

  const currentPoints = readArrowPoints(arrow);
  const geometryPoint = toArrowGeometryPoint(arrow, point);
  const pointIndex = getArrowPointRemovalIndex(settings, currentPoints, geometryPoint);

  if (pointIndex !== -1) {
    removeArrowPointGeometry(arrow, settings, currentPoints, pointIndex, updateArrowObject);
    return;
  }

  insertArrowPointGeometry(arrow, settings, currentPoints, geometryPoint, updateArrowObject);
}
