import { type EditorArrowSettings } from '../../../../features/editor/document/types';
import type { ArrowPathInstance } from '../controls.types';
import type { PointLike } from '../types';
import { getEffectiveArrowMode, hasArrowPointControls, resolveArrowType } from '../variant';
import { readArrowSettings } from '../settings';
import { readArrowPoints } from '../controls-points';
import { offsetArrowEndpointControlPoint } from './endpoint-geometry';

function shouldExposeIntermediatePoints(
  arrow: ArrowPathInstance | null,
  settings: EditorArrowSettings,
  points: readonly PointLike[]
): boolean {
  return (
    getEffectiveArrowMode(settings) === 'curve' ||
    (resolveArrowType(settings.arrowType) === 'sharp' &&
      points.length > 2 &&
      (arrow === null || typeof arrow.sniptaleArrowPointsJson === 'string'))
  );
}

export function getEditableArrowPoints(
  arrow: ArrowPathInstance,
  settings = readArrowSettings(arrow)
): PointLike[] {
  if (!hasArrowPointControls(settings)) {
    return [];
  }

  const storedPoints = readArrowPoints(arrow);
  if (shouldExposeIntermediatePoints(arrow, settings, storedPoints)) {
    return storedPoints.map((point, index) =>
      offsetArrowEndpointControlPoint(point, storedPoints, index, settings)
    );
  }

  const start = storedPoints[0];
  const end = storedPoints[storedPoints.length - 1];
  return start && end
    ? [
        offsetArrowEndpointControlPoint(start, storedPoints, 0, settings),
        offsetArrowEndpointControlPoint(end, storedPoints, storedPoints.length - 1, settings),
      ]
    : storedPoints;
}

export function getStoredArrowPointIndex(
  settings: EditorArrowSettings,
  storedPoints: readonly PointLike[],
  displayIndex: number,
  exposeIntermediatePoints = getEffectiveArrowMode(settings) === 'curve'
): number {
  if (exposeIntermediatePoints) {
    return displayIndex;
  }

  return displayIndex === 0 ? 0 : storedPoints.length - 1;
}
