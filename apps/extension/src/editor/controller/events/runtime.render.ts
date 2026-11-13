import type { EditorControllerEventStateBindings } from './types';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { renderEditorFreehandPreview } from '../../drawing/preview';

type PreviewBindings = Pick<EditorControllerEventStateBindings, 'getCanvas' | 'getDrawSession'>;
export function renderEditorFreehandDraft(bindings: PreviewBindings): void {
  const canvas = bindings.getCanvas();
  const session = bindings.getDrawSession();
  if (!canvas || canvas.disposed || canvas.destroyed || !session?.object || session.object.visible)
    return;
  // Native pointermove already batches samples; another rAF delays the accepted tail.
  canvas.renderTop();
}

function renderActiveDrawingPreview(
  bindings: Pick<EditorControllerEventStateBindings, 'getDrawSession'>,
  context: CanvasRenderingContext2D
): boolean {
  const object = bindings.getDrawSession()?.object;
  if (!object || object.visible) return false;
  const drawing = readEditorDrawingObject(object);
  if (drawing?.kind !== 'pencil' && drawing?.kind !== 'marker') return false;
  return renderEditorFreehandPreview(context, drawing);
}

export function createAfterRenderHandler(
  bindings: Pick<EditorControllerEventStateBindings, 'getCanvas' | 'getDrawSession'>
) {
  return (event: { ctx: CanvasRenderingContext2D }) => {
    const canvas = bindings.getCanvas();
    if (
      !canvas ||
      !canvas.contextTop ||
      (event.ctx !== canvas.getContext() && event.ctx !== canvas.contextTop)
    ) {
      return;
    }

    const ctx = canvas.getSelectionContext();
    if (!ctx || !canvas.viewportTransform) {
      return;
    }

    ctx.save();
    ctx.transform(...canvas.viewportTransform);
    try {
      if (renderActiveDrawingPreview(bindings, ctx)) canvas.contextTopDirty = true;
    } finally {
      ctx.restore();
    }
  };
}
