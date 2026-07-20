import { Point, type Canvas, type Path } from 'fabric';
import type { EditorBrushSettings } from '../../../features/editor/document/types';
import { configureLiveFreehandBrush } from './brush/live';
import { getBrushDecimate } from './brush-config';
import { buildDynamicFreehandPathData } from './dynamic-width';
import type { FreehandPointRecord } from './points';
import type { FreehandStrokeSample } from './samples';

function resolveFreehandBrushCanvas(canvas: Canvas | null | undefined): Canvas {
  return (canvas ?? { getZoom: () => 1 }) as Canvas;
}

export function buildFreehandPathData(
  points: readonly FreehandPointRecord[],
  settings: EditorBrushSettings,
  canvas: Canvas | null | undefined,
  samples?: readonly FreehandStrokeSample[] | null
): Path['path'] | null {
  if (points.length === 0) {
    return null;
  }

  if (settings.dynamicWidth === true) {
    return buildDynamicFreehandPathData(points, settings, samples);
  }

  const brush = configureLiveFreehandBrush(resolveFreehandBrushCanvas(canvas), settings, null);
  const fabricPoints = points.map((point) => new Point(point.x, point.y));
  const nextPoints = brush.decimate
    ? brush.decimatePoints(fabricPoints, getBrushDecimate(settings))
    : fabricPoints;
  const pathData = brush.convertPointsToSVGPath(nextPoints);
  return pathData.length > 0 ? brush.createPath(pathData).path : null;
}
