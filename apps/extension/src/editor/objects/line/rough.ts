import type { EditorLineSettings } from '../../../features/editor/document/line-types';
import { buildSketchPolylinePathData } from '../sketch-path/path-data';
import type { LinePoint } from './types';

export const LINE_ROUGH_SEED = 43;

function buildClosedSketchPathData(points: readonly LinePoint[], settings: EditorLineSettings) {
  const start = points[0];
  if (!start) {
    return 'M 0 0 L 0 0';
  }

  return `${buildSketchPolylinePathData([...points, start], {
    bowing: settings.bowing ?? 0,
    roughness: settings.roughness,
    seed: LINE_ROUGH_SEED,
    strokeWidth: settings.width,
  })} Z`;
}

export function buildRoughLinePathData(
  points: readonly LinePoint[],
  settings: EditorLineSettings,
  closed: boolean
): string {
  if (!closed) {
    return buildSketchPolylinePathData(points, {
      bowing: settings.bowing ?? 0,
      roughness: settings.roughness,
      seed: LINE_ROUGH_SEED,
      strokeWidth: settings.width,
    });
  }

  return buildClosedSketchPathData(points, settings);
}

export function shouldRenderRoughLine(settings: EditorLineSettings): boolean {
  return settings.roughness > 0 || (settings.bowing ?? 0) > 0;
}
