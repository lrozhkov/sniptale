import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { ArrowPathInstance } from '../controls.types';
import type { PointLike } from '../types';
import { clonePoint } from './hit-testing';
import type { UpdateArrowObjectFn } from './types';

export function removeArrowPointGeometry(
  arrow: ArrowPathInstance,
  settings: EditorArrowSettings,
  currentPoints: readonly PointLike[],
  pointIndex: number,
  updateArrowObject: UpdateArrowObjectFn
): boolean {
  if (pointIndex <= 0 || pointIndex >= currentPoints.length - 1) {
    return false;
  }

  const nextPoints = currentPoints.map(clonePoint);
  nextPoints.splice(pointIndex, 1);
  const nextMode = nextPoints.length >= 3 ? settings.mode : 'straight';
  updateArrowObject(arrow, {
    settings: { ...settings, mode: nextMode },
    points: nextPoints,
  });
  return true;
}
