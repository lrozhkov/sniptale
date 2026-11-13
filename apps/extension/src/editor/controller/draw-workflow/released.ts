import type { Canvas, FabricObject } from 'fabric';

type ReleasedDrawing = {
  object: FabricObject;
  complete: () => void;
  onFailure: (error: unknown) => void;
  onSettled?: () => void;
  cancelSchedule: () => void;
  flushing: boolean;
};
const releasedDrawings = new WeakMap<Canvas, ReleasedDrawing>();

/** Settles a released stroke before another command can observe or change its document. */
export function flushEditorFreehandCompletion(canvas: Canvas | null): void {
  if (!canvas) return;
  const pending = releasedDrawings.get(canvas);
  if (!pending || pending.flushing) return;
  pending.cancelSchedule();
  if (canvas.disposed || canvas.destroyed || !canvas.getObjects().includes(pending.object)) {
    releasedDrawings.delete(canvas);
    pending.onSettled?.();
    return;
  }
  pending.flushing = true;
  try {
    pending.complete();
    releasedDrawings.delete(canvas);
    pending.onSettled?.();
  } finally {
    pending.flushing = false;
  }
}

/** Reports the accepted release without making a history snapshot in the input handler. */
export function hasPendingEditorFreehandCompletion(canvas: Canvas | null): boolean {
  const pending = canvas && releasedDrawings.get(canvas);
  return Boolean(pending && !pending.flushing);
}

/** Ends input immediately while allowing the accepted preview to reach a frame first. */
export function deferEditorFreehandCompletion(options: {
  canvas: Canvas;
  object: FabricObject;
  complete: () => void;
  onFailure: (error: unknown) => void;
  onSettled?: () => void;
}): void {
  const { canvas } = options;
  flushEditorFreehandCompletion(canvas);
  let frame = 0;
  let task = 0;
  const flushBeforeInput = (event: Event) => {
    if (event.type === 'blur' && event.target !== window) return;
    flushEditorFreehandCompletion(canvas);
  };
  const hidden = () => {
    if (document.hidden) flushEditorFreehandCompletion(canvas);
  };
  const events = ['pointerdown', 'mousedown', 'keydown', 'wheel', 'blur', 'pagehide'] as const;
  const cancelSchedule = () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(task);
    for (const type of events) window.removeEventListener(type, flushBeforeInput, true);
    document.removeEventListener('visibilitychange', hidden);
  };
  const pending: ReleasedDrawing = { ...options, cancelSchedule, flushing: false };
  releasedDrawings.set(canvas, pending);
  for (const type of events) window.addEventListener(type, flushBeforeInput, true);
  document.addEventListener('visibilitychange', hidden);
  const complete = () => {
    if (releasedDrawings.get(canvas) !== pending) return;
    try {
      flushEditorFreehandCompletion(canvas);
    } catch (error) {
      options.onFailure(error);
    }
  };
  if (document.hidden) task = window.setTimeout(complete, 0);
  else {
    // A second frame separates terminal input from completion even when up flushes a move batch.
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        task = window.setTimeout(complete, 0);
      });
    });
  }
}
