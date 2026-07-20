import { type EditorArrowSettings } from '../../../../features/editor/document/types';
import { clonePoint } from '../geometry/points';
import type { PointLike } from '../types';
import { hasArrowPointControls } from '../variant';
import { getEndpointOffsetVector } from './endpoint-geometry';
import { getStoredArrowPointIndex } from './exposure';

export function resolveArrowStoredPointFromControl(
  settings: EditorArrowSettings,
  storedPoints: readonly PointLike[],
  displayIndex: number,
  displayPoint: PointLike
): PointLike {
  if (!hasArrowPointControls(settings)) {
    return displayPoint;
  }

  const actualIndex = getStoredArrowPointIndex(settings, storedPoints, displayIndex);
  const initialOffset = getEndpointOffsetVector(actualIndex, storedPoints, settings);
  const provisionalPoint = {
    x: displayPoint.x - initialOffset.x,
    y: displayPoint.y - initialOffset.y,
  };
  const provisionalPoints = storedPoints.map(clonePoint);
  if (actualIndex >= 0 && actualIndex < provisionalPoints.length) {
    provisionalPoints[actualIndex] = provisionalPoint;
  }
  const offset = getEndpointOffsetVector(actualIndex, provisionalPoints, settings);
  return {
    x: displayPoint.x - offset.x,
    y: displayPoint.y - offset.y,
  };
}
