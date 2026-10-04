import type { Canvas } from 'fabric';
import type { EditorControllerEventStateBindings } from './types';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { renderEditorFreehandPreview } from '../../drawing/preview';

type PreviewBindings = Pick<EditorControllerEventStateBindings, 'getCanvas' | 'getDrawSession'>;
const pendingPreviews = new WeakMap<Canvas, number>();

export function cancelEditorFreehandPreview(canvas: Canvas): void {
  const frame = pendingPreviews.get(canvas);
  if (frame === undefined) return;
  window.cancelAnimationFrame(frame);
  pendingPreviews.delete(canvas);
}

export function requestEditorFreehandPreview(bindings: PreviewBindings): void {
  const canvas = bindings.getCanvas();
  if (!canvas || pendingPreviews.has(canvas)) return;
  const session = bindings.getDrawSession();
  const frame = window.requestAnimationFrame(() => {
    pendingPreviews.delete(canvas);
    if (
      canvas.disposed ||
      canvas.destroyed ||
      bindings.getCanvas() !== canvas ||
      !session ||
      bindings.getDrawSession() !== session ||
      session.object?.visible
    )
      return;
    canvas.renderTop();
  });
  pendingPreviews.set(canvas, frame);
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

    cancelEditorFreehandPreview(canvas);
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
