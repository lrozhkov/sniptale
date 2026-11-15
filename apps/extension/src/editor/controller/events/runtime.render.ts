import type { Canvas, FabricObject } from 'fabric';
import type { EditorControllerEventStateBindings } from './types';
import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { renderEditorFreehandPreview } from '../../drawing/preview';

const completedPreviews = new WeakMap<Canvas, Set<FabricObject>>();

/** Keeps completed ink on the top plane until the scene has actually rendered it. */
export function retainCompletedEditorFreehandPreview(canvas: Canvas, object: FabricObject): void {
  let pending = completedPreviews.get(canvas);
  if (!pending) {
    pending = new Set();
    completedPreviews.set(canvas, pending);
  }
  pending.add(object);
}

function renderCompletedPreviews(canvas: Canvas, context: CanvasRenderingContext2D): boolean {
  const pending = completedPreviews.get(canvas);
  if (!pending) return false;
  const objects = canvas.getObjects();
  let rendered = false;
  for (const object of pending) {
    if (!objects.includes(object)) {
      pending.delete(object);
      continue;
    }
    if (object.visible) {
      object.render(context);
      rendered = true;
    } else {
      const drawing = readEditorDrawingObject(object);
      if (drawing?.kind === 'pencil' || drawing?.kind === 'marker')
        rendered = renderEditorFreehandPreview(context, drawing) || rendered;
    }
  }
  return rendered;
}

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

    // Fabric mouseup clears renderTop after completion; main paint ends the handoff.
    if (event.ctx === canvas.getContext()) {
      const pending = completedPreviews.get(canvas);
      if (pending) {
        for (const object of pending)
          if (object.visible || !canvas.getObjects().includes(object)) pending.delete(object);
        if (!pending.size) completedPreviews.delete(canvas);
      }
    }

    const ctx = canvas.getSelectionContext();
    if (!ctx || !canvas.viewportTransform) {
      return;
    }

    ctx.save();
    ctx.transform(...canvas.viewportTransform);
    try {
      const completed = renderCompletedPreviews(canvas, ctx);
      const active = renderActiveDrawingPreview(bindings, ctx);
      if (completed || active) canvas.contextTopDirty = true;
    } finally {
      ctx.restore();
    }
  };
}
