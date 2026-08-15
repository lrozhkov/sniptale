import type {
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from './types';
import { EDITOR_CANVAS_CROP_OVERLAY } from '../../color/palette/constants';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { renderEditorFreehandPreview } from '../../drawing/preview';

function renderActiveDrawingPreview(
  bindings: Pick<EditorControllerEventStateBindings, 'getDrawSession'>,
  context: CanvasRenderingContext2D
): void {
  const object = bindings.getDrawSession()?.object;
  if (!object || object.visible) return;
  const drawing = readEditorDrawingObject(object);
  if (drawing?.kind !== 'pencil' && drawing?.kind !== 'marker') return;
  renderEditorFreehandPreview(context, drawing);
}

export function createAfterRenderHandler(
  bindings: Pick<
    EditorControllerEventStateBindings,
    'getCanvas' | 'getCanvasDocumentSize' | 'getDrawSession'
  > &
    Pick<EditorControllerEventObjectBindings, 'getActiveCropRect'>
) {
  return () => {
    const canvas = bindings.getCanvas();
    if (!canvas || !canvas.contextTop) {
      return;
    }

    const ctx = canvas.getSelectionContext();
    if (!ctx || !canvas.viewportTransform) {
      return;
    }

    ctx.save();
    ctx.transform(...canvas.viewportTransform);
    renderActiveDrawingPreview(bindings, ctx);

    const activeCropRect = bindings.getActiveCropRect();
    if (!activeCropRect) {
      ctx.restore();
      return;
    }

    const cropBounds = activeCropRect.getBoundingRect();
    const canvasWidth = bindings.getCanvasDocumentSize().width;
    const canvasHeight = bindings.getCanvasDocumentSize().height;
    const cropRight = cropBounds.left + cropBounds.width;
    const cropBottom = cropBounds.top + cropBounds.height;
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
