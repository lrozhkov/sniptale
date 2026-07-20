import type { EditorArrowSettings } from '../../../features/editor/document/types';
import type { PointLike } from './types';
import { isTaperedArrowVariant } from './variant';
import { buildRoughArrowPathData, shouldRenderRoughArrow } from './rough';
import { buildTaperedArrowPathData } from './visual/tapered';
import { buildFilledArrowPathData } from './visual/outline';
import { buildStrokedArrowPathData } from './visual/stroked';

export function buildArrowPathData(points: PointLike[], settings: EditorArrowSettings): string {
  if ((settings.style ?? 'solid') !== 'solid') {
    return buildStrokedArrowPathData(points, settings);
  }

  if (shouldRenderRoughArrow(settings) && !isTaperedArrowVariant(settings)) {
    return buildRoughArrowPathData(points, settings);
  }

  return isTaperedArrowVariant(settings)
    ? buildTaperedArrowPathData(points, settings)
    : buildFilledArrowPathData(points, settings);
}
