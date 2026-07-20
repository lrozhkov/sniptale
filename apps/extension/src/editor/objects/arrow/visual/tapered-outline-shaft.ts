import type { PointLike } from '../types';
import { getSmoothedPolylineSample } from './tapered-polyline/sample';
import type { PolylineFrame, PolylineLengthState } from './tapered-polyline/types';
import { TAPERED_SHAFT_SAMPLE_COUNT, type TaperedDimensions } from './tapered-template';
import { offsetTaperedOutlinePoint } from './tapered-outline-geometry';

function buildShaftDistances(shaftLength: number): number[] {
  return Array.from({ length: TAPERED_SHAFT_SAMPLE_COUNT + 1 }, (_, index) => {
    return shaftLength * (index / TAPERED_SHAFT_SAMPLE_COUNT);
  });
}

function getShaftHalf(metrics: TaperedDimensions, distance: number): number {
  if (metrics.shaftLength <= 0) {
    return metrics.shaftEndHalf;
  }

  const ratio = distance / metrics.shaftLength;
  return metrics.tailHalf + (metrics.shaftEndHalf - metrics.tailHalf) * ratio;
}

export function buildTaperedShaftSide(
  centerline: readonly PointLike[],
  lengthState: PolylineLengthState,
  metrics: TaperedDimensions,
  direction: 1 | -1,
  headBaseFrame: PolylineFrame
): PointLike[] {
  return buildShaftDistances(metrics.shaftLength).map((distance) => {
    const frame =
      distance >= metrics.shaftLength
        ? headBaseFrame
        : getSmoothedPolylineSample(centerline, lengthState, distance);
    return offsetTaperedOutlinePoint(
      frame.point,
      frame.normal,
      getShaftHalf(metrics, distance) * direction
    );
  });
}
