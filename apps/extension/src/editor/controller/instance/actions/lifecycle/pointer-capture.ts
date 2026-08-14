import type { Canvas } from 'fabric';

type EditorPointerCaptureCanvas = Pick<Canvas, 'upperCanvasEl'>;

const pointerCaptureCleanup = new WeakMap<EditorPointerCaptureCanvas, () => void>();

/** Keeps a fast object transform bound to the Fabric canvas until pointer release. */
export function attachEditorCanvasPointerCapture(canvas: EditorPointerCaptureCanvas): void {
  detachEditorCanvasPointerCapture(canvas);
  const element = canvas.upperCanvasEl;
  const capture = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already have ended before capture is established.
    }
  };
  const release = (event: PointerEvent) => {
    try {
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Lost capture is already the desired terminal state.
    }
  };
  element.addEventListener('pointerdown', capture);
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  pointerCaptureCleanup.set(canvas, () => {
    element.removeEventListener('pointerdown', capture);
    element.removeEventListener('pointerup', release);
    element.removeEventListener('pointercancel', release);
  });
}

export function detachEditorCanvasPointerCapture(canvas: EditorPointerCaptureCanvas): void {
  pointerCaptureCleanup.get(canvas)?.();
  pointerCaptureCleanup.delete(canvas);
}
