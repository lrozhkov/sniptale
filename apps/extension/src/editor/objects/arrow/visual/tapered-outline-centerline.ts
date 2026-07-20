import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import { buildArrowCenterline } from './centerline/build';
import { buildPolylineLengthState } from './tapered-polyline/length-state';
import type { PointLike } from '../types';

const TAPERED_FALLBACK_LENGTH_MULTIPLIER = 2.6;
const TAPERED_FALLBACK_MIN_LENGTH = 6;

function getFallbackCenterline(point: PointLike, width: number): PointLike[] {
  const length = Math.max(width * TAPERED_FALLBACK_LENGTH_MULTIPLIER, TAPERED_FALLBACK_MIN_LENGTH);

  return [
    { x: point.x - length / 2, y: point.y },
    { x: point.x + length / 2, y: point.y },
  ];
}

export function resolveTaperedOutlineCenterline(
  points: readonly PointLike[],
  settings: EditorArrowSettings
): PointLike[] {
  const centerline = buildArrowCenterline([...points], settings).points;
  const lengthState = buildPolylineLengthState(centerline);

  return lengthState.total > 0
    ? centerline
    : getFallbackCenterline(points[0] ?? { x: 0, y: 0 }, settings.width);
}
