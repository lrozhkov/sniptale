import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { PointLike } from '../types';
import { buildArrowHeadStrokePath } from './heads';
import { getFirstPoint } from './points';
import {
  buildSketchedArrowStrokePoints,
  joinArrowPathSegments,
  resolveArrowPathCenterline,
  trimArrowHeadAttachmentPoints,
} from './path-parts';

const STROKED_ROUGH_SEED = 79;

function polylineToOpenPath(points: readonly PointLike[]): string {
  const first = getFirstPoint(points);
  if (!first) {
    return '';
  }

  return [`M ${first.x} ${first.y}`, ...points.slice(1).map((point) => `L ${point.x} ${point.y}`)]
    .filter(Boolean)
    .join(' ');
}

export function buildStrokedArrowPathData(
  points: readonly PointLike[],
  settings: EditorArrowSettings
): string {
  const resolved = resolveArrowPathCenterline(points, settings);
  if (!resolved) {
    return '';
  }

  const { centerline, end, start } = resolved;

  const trimmed = trimArrowHeadAttachmentPoints(centerline.points, settings);
  const strokePoints =
    (settings.roughness ?? 0) > 0 || (settings.bowing ?? 0) > 0
      ? buildSketchedArrowStrokePoints({
          points: trimmed,
          seed: STROKED_ROUGH_SEED,
          settings,
        })
      : trimmed;

  return joinArrowPathSegments([
    polylineToOpenPath(strokePoints),
    buildArrowHeadStrokePath(
      settings.startHead,
      start,
      centerline.startAngle + Math.PI,
      settings.width,
      settings.startHeadSize
    ),
    buildArrowHeadStrokePath(
      settings.endHead,
      end,
      centerline.endAngle,
      settings.width,
      settings.endHeadSize
    ),
  ]);
}
