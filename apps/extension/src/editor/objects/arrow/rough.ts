import type { EditorArrowSettings } from '../../../features/editor/document/types';
import type { PointLike } from './types';
import {
  buildArrowShaftOutlinePath,
  buildFilledArrowHeadPaths,
  buildSketchedArrowStrokePoints,
  joinArrowPathSegments,
  resolveArrowPathCenterline,
  trimArrowHeadAttachmentPoints,
} from './visual/path-parts';

const ROUGH_SEED = 79;

export function shouldRenderRoughArrow(settings: EditorArrowSettings): boolean {
  return (settings.roughness ?? 0) > 0 || (settings.bowing ?? 0) > 0;
}

export function buildRoughArrowPathData(
  points: readonly PointLike[],
  settings: EditorArrowSettings
): string {
  const resolved = resolveArrowPathCenterline(points, settings);
  if (!resolved) {
    return '';
  }

  const { centerline } = resolved;
  const trimmedCenterline = trimArrowHeadAttachmentPoints(centerline.points, settings);
  const sketchedCenterline = buildSketchedArrowStrokePoints({
    points: trimmedCenterline,
    seed: ROUGH_SEED,
    settings,
  });
  return joinArrowPathSegments([
    buildArrowShaftOutlinePath(sketchedCenterline, settings),
    ...buildFilledArrowHeadPaths({
      endAngle: centerline.endAngle,
      points: centerline.points,
      settings,
      startAngle: centerline.startAngle,
    }),
  ]);
}
