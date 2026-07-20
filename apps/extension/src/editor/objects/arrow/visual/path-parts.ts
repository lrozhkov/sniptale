import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import { buildSketchPolylinePoints } from '../../sketch-path/sampling';
import type { PointLike } from '../types';
import { buildArrowCenterline } from './centerline/build';
import { buildArrowHeadPath, getArrowHeadAttachmentInset } from './heads';
import { getFirstPoint, getLastPoint } from './points';
import { trimPolyline } from './primitives';
import { buildDynamicShaftOutlinePath, buildShaftOutlinePath } from './styles';

export function trimArrowHeadAttachmentPoints(
  points: readonly PointLike[],
  settings: EditorArrowSettings
): PointLike[] {
  if (points.length < 2) {
    return [...points];
  }

  const startInset = getArrowHeadAttachmentInset(
    settings.startHead,
    settings.width,
    settings.startHeadSize
  );
  const endInset = getArrowHeadAttachmentInset(
    settings.endHead,
    settings.width,
    settings.endHeadSize
  );
  return trimPolyline(points, startInset, endInset);
}

export function buildArrowShaftOutlinePath(
  points: readonly PointLike[],
  settings: EditorArrowSettings
): string {
  return settings.dynamicWidth === true
    ? buildDynamicShaftOutlinePath(points, settings.width)
    : buildShaftOutlinePath(points, settings.width);
}

export function buildFilledArrowHeadPaths(args: {
  endAngle: number;
  points: readonly PointLike[];
  settings: EditorArrowSettings;
  startAngle: number;
}): string[] {
  const start = getFirstPoint(args.points);
  const end = getLastPoint(args.points);
  if (!start || !end) {
    return [];
  }

  return [
    buildArrowHeadPath(
      args.settings.startHead,
      start,
      args.startAngle + Math.PI,
      args.settings.width,
      args.settings.startHeadSize
    ),
    buildArrowHeadPath(
      args.settings.endHead,
      end,
      args.endAngle,
      args.settings.width,
      args.settings.endHeadSize
    ),
  ];
}

export function joinArrowPathSegments(segments: readonly string[]): string {
  return segments.filter(Boolean).join(' ');
}

export function buildSketchedArrowStrokePoints(args: {
  points: readonly PointLike[];
  seed: number;
  settings: EditorArrowSettings;
}): PointLike[] {
  return buildSketchPolylinePoints(args.points, {
    bowing: args.settings.bowing ?? 0,
    roughness: args.settings.roughness ?? 0,
    seed: args.seed,
    strokeWidth: args.settings.width,
  });
}

export function resolveArrowPathCenterline(
  points: readonly PointLike[],
  settings: EditorArrowSettings
): {
  centerline: ReturnType<typeof buildArrowCenterline>;
  end: PointLike;
  start: PointLike;
} | null {
  if (points.length < 2) {
    return null;
  }

  const centerline = buildArrowCenterline([...points], settings);
  const start = getFirstPoint(centerline.points);
  const end = getLastPoint(centerline.points);
  return start && end ? { centerline, end, start } : null;
}
