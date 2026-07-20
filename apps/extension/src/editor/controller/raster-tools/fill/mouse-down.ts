import type { Canvas, FabricObject, Point } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import { EDITOR_RASTER_FILL_MODE } from '../../../state/raster-tools';
import { notifyEditorRasterOverlay } from '../session';
import { resolveSnapshotForEdit, type RasterToolBindings } from '../shared';
import { resolveBitmapPoint } from '../../raster/target';
import { applyBucketFill } from './bucket';

export async function handleFillMouseDown(
  bindings: RasterToolBindings,
  canvas: Canvas,
  scenePoint: Point,
  fallbackTarget?: FabricObject | null
): Promise<boolean> {
  const settings = useEditorStore.getState().rasterToolSettings;
  if (settings.fillMode === EDITOR_RASTER_FILL_MODE.BUCKET) {
    return await applyBucketFill(bindings, canvas, scenePoint, fallbackTarget);
  }

  const targetSnapshot = await resolveSnapshotForEdit(bindings, canvas, fallbackTarget);
  if (!targetSnapshot) {
    return false;
  }

  const bitmapPoint = resolveBitmapPoint({
    snapshot: targetSnapshot.snapshot,
    canvas,
    reference: targetSnapshot.snapshot.reference,
    scenePoint,
    targetObject: targetSnapshot.targetObject,
  });
  if (!bitmapPoint) {
    return false;
  }

  bindings.getRasterToolSession().gradientDraft = {
    snapshot: targetSnapshot.snapshot,
    startBitmapPoint: bitmapPoint,
    currentBitmapPoint: bitmapPoint,
    startScenePoint: scenePoint,
    currentScenePoint: scenePoint,
  };
  notifyEditorRasterOverlay(bindings.getRasterToolSession());
  return true;
}
