import type { EditorControllerEventStateBindings } from './types';
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
  bindings: Pick<EditorControllerEventStateBindings, 'getCanvas' | 'getDrawSession'>
) {
  return (event: { ctx: CanvasRenderingContext2D }) => {
    const canvas = bindings.getCanvas();
    if (!canvas || !canvas.contextTop || event.ctx !== canvas.getContext()) {
      return;
    }

    const ctx = canvas.getSelectionContext();
    if (!ctx || !canvas.viewportTransform) {
      return;
    }

    ctx.save();
    ctx.transform(...canvas.viewportTransform);
    renderActiveDrawingPreview(bindings, ctx);

    ctx.restore();
  };
}
