import type { EditorArrowSettings } from '../../../../../features/editor/document/types';
import { normalizeArrowPoints } from '../../geometry/normalization';
import { clonePoint } from '../../geometry/points';
import type { PointLike } from '../../types';
import { getEffectiveArrowMode } from '../../variant';
import { getFirstPoint, getLastPoint } from '../points';
import { getFirstNonZeroEdgeAngle } from './angles';
import { sampleArrowCurve } from './curve';
import { buildEmptyCenterline } from './empty';
import type { ArrowCenterline } from './types';

export function buildArrowCenterline(
  points: PointLike[],
  settings: EditorArrowSettings
): ArrowCenterline {
  const normalizedPoints = normalizeArrowPoints(points, settings);
  const start = getFirstPoint(normalizedPoints);
  const end = getLastPoint(normalizedPoints);
  if (!start || !end) {
    return buildEmptyCenterline();
  }

  const centerline =
    getEffectiveArrowMode(settings) === 'curve' && normalizedPoints.length >= 3
      ? sampleArrowCurve(normalizedPoints)
      : normalizedPoints.map(clonePoint);

  return {
    points: centerline,
    startAngle: getFirstNonZeroEdgeAngle(normalizedPoints, false),
    endAngle: getFirstNonZeroEdgeAngle(normalizedPoints, true),
  };
}
