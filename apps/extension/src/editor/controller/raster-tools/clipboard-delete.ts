import { clearRasterBitmap } from '../raster/mutations';
import { resolveRasterOverlayObject } from '../raster/object/lookup';
import { createRasterTargetSnapshot } from '../raster/target';
import { clearEditorRasterSelection } from './session/selection';
import { copyRasterSelectionToClipboard } from './clipboard-copy/controller';
import { copySelectionMask } from './clipboard-copy/mask';
import type { ApplyRasterBitmapTarget, ClipboardControllerLike } from './clipboard-types';

export async function deleteRasterSelectionPixels(
  controller: ClipboardControllerLike & ApplyRasterBitmapTarget
): Promise<boolean> {
  const selection = controller.rasterToolSession.selection;
  const targetObject = selection
    ? resolveRasterOverlayObject(controller.canvas, selection.reference)
    : null;
  if (!selection || !targetObject) {
    return false;
  }

  const snapshot = await createRasterTargetSnapshot({
    object: targetObject,
    reference: selection.reference,
  });
  clearRasterBitmap({
    bitmap: snapshot.bitmap,
    maskCanvas: copySelectionMask(selection),
  });
  await controller.applyRasterBitmap(selection.reference, snapshot.bitmap);
  clearEditorRasterSelection(controller.rasterToolSession);
  return true;
}

export async function cutRasterSelectionToClipboard(
  controller: ClipboardControllerLike & ApplyRasterBitmapTarget
): Promise<boolean> {
  const copied = await copyRasterSelectionToClipboard(controller);
  if (!copied) {
    return false;
  }

  return await deleteRasterSelectionPixels(controller);
}
