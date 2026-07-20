import type { Canvas, Point } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import { resolveRasterGradientStops } from '../gradient-stops';
import { notifyEditorRasterOverlay } from '../session';
import type { EditorRasterToolSessionState } from '../types';
import { getSelectionMaskForSnapshot, type RasterToolBindings } from '../shared';
import { fillRasterBitmapWithLinearGradient } from '../../raster/mutations';
import { resolveRasterOverlayObject } from '../../raster/object';
import { resolveBitmapPoint } from '../../raster/target';

export function updateGradientDraft(
  session: EditorRasterToolSessionState,
  canvas: Canvas,
  overlayCanvas: Canvas | null,
  scenePoint: Point
): boolean {
  if (!session.gradientDraft) {
    return false;
  }

  const targetObject = resolveRasterOverlayObject(
    overlayCanvas,
    session.gradientDraft.snapshot.reference
  );
  const bitmapPoint = resolveBitmapPoint({
    snapshot: session.gradientDraft.snapshot,
    canvas,
    reference: session.gradientDraft.snapshot.reference,
    scenePoint,
    targetObject,
  });
  if (!bitmapPoint) {
    return true;
  }

  session.gradientDraft.currentBitmapPoint = bitmapPoint;
  session.gradientDraft.currentScenePoint = scenePoint;
  notifyEditorRasterOverlay(session);
  return true;
}

export async function finishGradientDraft(
  bindings: RasterToolBindings,
  session: EditorRasterToolSessionState
): Promise<boolean> {
  if (!session.gradientDraft) {
    return false;
  }

  const settings = useEditorStore.getState().rasterToolSettings;
  const { snapshot, startBitmapPoint, currentBitmapPoint } = session.gradientDraft;
  session.gradientDraft = null;
  fillRasterBitmapWithLinearGradient({
    bitmap: snapshot.bitmap,
    start: startBitmapPoint,
    end: currentBitmapPoint,
    stops: resolveRasterGradientStops(settings),
    maskCanvas: getSelectionMaskForSnapshot(session, snapshot),
  });
  notifyEditorRasterOverlay(session);
  await bindings.applyRasterBitmap(snapshot.reference, snapshot.bitmap);
  return true;
}
