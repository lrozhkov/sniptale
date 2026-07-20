import type { Canvas, FabricObject, Point } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import {
  getSelectionMaskForSnapshot,
  resolveSnapshotForEdit,
  type RasterToolBindings,
} from '../shared';
import { fillRasterBitmap, floodFillRasterBitmap } from '../../raster/mutations';
import { resolveBitmapPoint } from '../../raster/target';

const BUCKET_FILL_TOLERANCE = 96;

export async function applyBucketFill(
  bindings: RasterToolBindings,
  canvas: Canvas,
  scenePoint: Point,
  fallbackTarget?: FabricObject | null
): Promise<boolean> {
  const resolved = await resolveSnapshotForEdit(bindings, canvas, fallbackTarget);
  if (!resolved) {
    return false;
  }

  const settings = useEditorStore.getState().rasterToolSettings;
  const session = bindings.getRasterToolSession();
  const maskCanvas = getSelectionMaskForSnapshot(session, resolved.snapshot);
  if (maskCanvas) {
    fillRasterBitmap({
      bitmap: resolved.snapshot.bitmap,
      color: settings.fillColor,
      maskCanvas,
    });
  } else {
    const bitmapPoint = resolveBitmapPoint({
      snapshot: resolved.snapshot,
      canvas,
      reference: resolved.snapshot.reference,
      scenePoint,
      targetObject: resolved.targetObject,
    });
    if (!bitmapPoint) {
      return false;
    }

    floodFillRasterBitmap({
      bitmap: resolved.snapshot.bitmap,
      startX: bitmapPoint.x,
      startY: bitmapPoint.y,
      color: settings.fillColor,
      tolerance: BUCKET_FILL_TOLERANCE,
    });
  }

  await bindings.applyRasterBitmap(resolved.snapshot.reference, resolved.snapshot.bitmap);
  return true;
}
