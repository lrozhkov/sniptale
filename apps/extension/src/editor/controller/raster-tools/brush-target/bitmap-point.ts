import type { Canvas, Point } from 'fabric';
import { resolveBitmapPoint } from '../../raster/target';
import type { EditorRasterTargetSnapshot } from '../../raster/types';
import { mapScenePointToBitmap } from '../shared';
import type { BrushTargetIntent } from './types';

export function resolveBrushBitmapPoint(
  canvas: Canvas,
  scenePoint: Point,
  intent: BrushTargetIntent
): { x: number; y: number } | null {
  if (intent.kind === 'blocked') {
    return null;
  }

  if (intent.kind === 'create') {
    return resolveBrushDraftBitmapPoint(scenePoint, intent.snapshot);
  }

  return resolveBitmapPoint({
    canvas,
    reference: intent.snapshot.reference,
    scenePoint,
    snapshot: intent.snapshot,
    targetObject: intent.object,
  });
}

export function resolveBrushDraftBitmapPoint(
  scenePoint: Point,
  snapshot: EditorRasterTargetSnapshot
): { x: number; y: number } | null {
  const bitmapPoint = mapScenePointToBitmap(snapshot, scenePoint);
  if (
    bitmapPoint.x < 0 ||
    bitmapPoint.y < 0 ||
    bitmapPoint.x > snapshot.bitmap.width ||
    bitmapPoint.y > snapshot.bitmap.height
  ) {
    return null;
  }

  return {
    x: Math.min(snapshot.bitmap.width - 1, Math.max(0, bitmapPoint.x)),
    y: Math.min(snapshot.bitmap.height - 1, Math.max(0, bitmapPoint.y)),
  };
}
