import type {
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from './types';
import { EDITOR_CANVAS_CROP_OVERLAY } from '../../color/palette/constants';

export function createAfterRenderHandler(
  bindings: EditorControllerEventStateBindings &
    Pick<EditorControllerEventObjectBindings, 'getActiveCropRect'>
) {
  return () => {
    const canvas = bindings.getCanvas();
    if (!canvas || !canvas.contextTop) {
      return;
    }

    const activeCropRect = bindings.getActiveCropRect();
    if (!activeCropRect) {
      return;
    }

    const cropBounds = activeCropRect.getBoundingRect();
    const ctx = canvas.getSelectionContext();
    if (!ctx || !canvas.viewportTransform) {
      return;
    }

    const canvasWidth = bindings.getCanvasDocumentSize().width;
    const canvasHeight = bindings.getCanvasDocumentSize().height;
    const cropRight = cropBounds.left + cropBounds.width;
    const cropBottom = cropBounds.top + cropBounds.height;

    ctx.save();
    ctx.transform(...canvas.viewportTransform);
    ctx.fillStyle = EDITOR_CANVAS_CROP_OVERLAY;
    ctx.fillRect(0, 0, canvasWidth, cropBounds.top);
    ctx.fillRect(0, cropBottom, canvasWidth, Math.max(0, canvasHeight - cropBottom));
    ctx.fillRect(0, cropBounds.top, cropBounds.left, cropBounds.height);
    ctx.fillRect(
      cropRight,
      cropBounds.top,
      Math.max(0, canvasWidth - cropRight),
      cropBounds.height
    );
    ctx.restore();
  };
}
