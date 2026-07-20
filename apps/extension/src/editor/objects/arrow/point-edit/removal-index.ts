import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { PointLike } from '../types';
import {
  getEffectiveArrowMode,
  hasArrowCurvePointEditing,
  hasArrowPointControls,
} from '../variant';
import {
  findNearestInternalPointIndex,
  getDoubleClickPointHitThresholdSquared,
} from './hit-testing';

export function getArrowPointRemovalIndex(
  settings: EditorArrowSettings,
  currentPoints: readonly PointLike[],
  geometryPoint: PointLike
): number {
  if (
    !hasArrowPointControls(settings) ||
    !hasArrowCurvePointEditing(settings) ||
    getEffectiveArrowMode(settings) !== 'curve'
  ) {
    return -1;
  }

  return findNearestInternalPointIndex(
    currentPoints,
    geometryPoint,
    getDoubleClickPointHitThresholdSquared(settings)
  );
}

export function getArrowPointRemovalIndexByDistance(
  settings: EditorArrowSettings,
  currentPoints: readonly PointLike[],
  geometryPoint: PointLike
): number {
  if (
    !hasArrowPointControls(settings) ||
    !hasArrowCurvePointEditing(settings) ||
    getEffectiveArrowMode(settings) !== 'curve'
  ) {
    return -1;
  }

  const threshold = Math.max(16, settings.width * 3.5);
  return findNearestInternalPointIndex(currentPoints, geometryPoint, threshold ** 2);
}
