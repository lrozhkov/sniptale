import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { PointLike } from '../types';
import { buildArrowCenterline } from './centerline/build';
import { getFirstPoint, getLastPoint } from './points';
import {
  buildArrowShaftOutlinePath,
  buildFilledArrowHeadPaths,
  joinArrowPathSegments,
  trimArrowHeadAttachmentPoints,
} from './path-parts';

export function buildFilledArrowPathData(
  points: PointLike[],
  settings: EditorArrowSettings
): string {
  const centerline = buildArrowCenterline(points, settings);
  const start = getFirstPoint(centerline.points);
  const end = getLastPoint(centerline.points);
  if (!start || !end) {
    return '';
  }

  const trimmedCenterline = trimArrowHeadAttachmentPoints(centerline.points, settings);
  return joinArrowPathSegments([
    buildArrowShaftOutlinePath(trimmedCenterline, settings),
    ...buildFilledArrowHeadPaths({
      endAngle: centerline.endAngle,
      points: centerline.points,
      settings,
      startAngle: centerline.startAngle,
    }),
  ]);
}
