import type { Canvas } from 'fabric';
import { resolveRasterOverlayObject } from '../../raster/object/lookup';
import { createRasterTargetSnapshot } from '../../raster/target';
import { canvasToRasterDataUrl } from '../../raster/bitmap';
import { clearEditorRasterSelection } from '../session/selection';
import type { EditorRasterToolSessionState } from '../types';
import type { RasterClipboardPayload } from '../clipboard-types';
import { createMaskedClipboardBitmap } from './mask';

export async function resolveClipboardPayload(
  session: EditorRasterToolSessionState,
  canvas: Canvas | null
): Promise<RasterClipboardPayload | null> {
  if (!session.selection || !canvas) {
    return null;
  }

  const targetObject = resolveRasterOverlayObject(canvas, session.selection.reference);
  if (!targetObject) {
    clearEditorRasterSelection(session);
    return null;
  }

  const snapshot = await createRasterTargetSnapshot({
    object: targetObject,
    reference: session.selection.reference,
  });
  const masked = createMaskedClipboardBitmap(session.selection, snapshot);
  if (!masked) {
    return null;
  }

  return {
    ...masked,
    dataUrl: canvasToRasterDataUrl(masked.bitmap),
    reference: session.selection.reference,
  };
}
