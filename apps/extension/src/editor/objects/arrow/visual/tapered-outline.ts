import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { PointLike } from '../types';
import { buildPolylineLengthState } from './tapered-polyline/length-state';
import { getSmoothedPolylineSample } from './tapered-polyline/sample';
import { resolveTaperedDimensions } from './tapered-template';
import { buildTaperedHeadBaseFrame, buildTaperedHeadOutline } from './tapered-outline-head';
import { buildTaperedShaftSide } from './tapered-outline-shaft';
import { resolveTaperedOutlineCenterline } from './tapered-outline-centerline';

export function buildTaperedArrowOutline(
  points: readonly PointLike[],
  settings: EditorArrowSettings
): PointLike[] {
  const centerline = resolveTaperedOutlineCenterline(points, settings);
  const lengthState = buildPolylineLengthState(centerline);
  const metrics = resolveTaperedDimensions(lengthState.total, settings.width);
  const baseSample = getSmoothedPolylineSample(centerline, lengthState, metrics.shaftLength);
  const tipFrame = getSmoothedPolylineSample(centerline, lengthState, lengthState.total);
  const headBaseFrame = buildTaperedHeadBaseFrame(baseSample.point, tipFrame);
  const shaftUpper = buildTaperedShaftSide(centerline, lengthState, metrics, 1, headBaseFrame);
  const shaftLower = buildTaperedShaftSide(
    centerline,
    lengthState,
    metrics,
    -1,
    headBaseFrame
  ).reverse();
  const head = buildTaperedHeadOutline(headBaseFrame, tipFrame, metrics.headWidth);

  return [...shaftUpper, ...head.upper, head.tip, ...head.lower.reverse(), ...shaftLower];
}
