import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { ArrowPathInstance } from '../controls.types';
import type { PointLike } from '../types';
import {
  getEffectiveArrowMode,
  hasArrowCurvePointEditing,
  hasArrowPointControls,
} from '../variant';
import { clonePoint, findNearestSegmentIndex } from './hit-testing';
import type { UpdateArrowObjectFn } from './types';

export function insertArrowPointGeometry(
  arrow: ArrowPathInstance,
  settings: EditorArrowSettings,
  currentPoints: readonly PointLike[],
  geometryPoint: PointLike,
  updateArrowObject: UpdateArrowObjectFn
): void {
  if (!hasArrowPointControls(settings) || !hasArrowCurvePointEditing(settings)) {
    return;
  }

  if (getEffectiveArrowMode(settings) !== 'curve') {
    const startPoint = currentPoints[0] ?? geometryPoint;
    const endPoint = currentPoints[currentPoints.length - 1] ?? geometryPoint;
    updateArrowObject(arrow, {
      settings: { ...settings, mode: 'curve' },
      points: [startPoint, geometryPoint, endPoint],
    });
    return;
  }

  const nextPoints = currentPoints.map(clonePoint);
  const nearestSegmentIndex = findNearestSegmentIndex(nextPoints, geometryPoint);
  nextPoints.splice(nearestSegmentIndex + 1, 0, geometryPoint);
  updateArrowObject(arrow, { settings, points: nextPoints });
}
