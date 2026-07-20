import type { PointLike } from '../types';
import type { PolylineFrame } from './tapered-polyline/types';
import { offsetTaperedOutlinePoint } from './tapered-outline-geometry';

interface TaperedHeadOutline {
  lower: PointLike[];
  tip: PointLike;
  upper: PointLike[];
}

function buildHeadTip(tipFrame: PolylineFrame): PointLike {
  return tipFrame.point;
}

function buildHeadShoulder(baseFrame: PolylineFrame, width: number, direction: 1 | -1): PointLike {
  return offsetTaperedOutlinePoint(baseFrame.point, baseFrame.normal, width * direction);
}

export function buildTaperedHeadBaseFrame(
  basePoint: PointLike,
  tipFrame: PolylineFrame
): PolylineFrame {
  return {
    normal: {
      x: -tipFrame.tangent.y,
      y: tipFrame.tangent.x,
    },
    point: basePoint,
    tangent: tipFrame.tangent,
  };
}

export function buildTaperedHeadOutline(
  headBaseFrame: PolylineFrame,
  tipFrame: PolylineFrame,
  width: number
): TaperedHeadOutline {
  return {
    lower: [buildHeadShoulder(headBaseFrame, width, -1)],
    tip: buildHeadTip(tipFrame),
    upper: [buildHeadShoulder(headBaseFrame, width, 1)],
  };
}
