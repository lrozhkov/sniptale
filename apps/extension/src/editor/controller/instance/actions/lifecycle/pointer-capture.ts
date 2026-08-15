import type { Canvas } from 'fabric';

type EditorPointerCaptureCanvas = Pick<Canvas, 'upperCanvasEl'>;

const pointerCaptureCleanup = new WeakMap<EditorPointerCaptureCanvas, () => void>();

/** Keeps a fast object transform bound to the Fabric canvas until pointer release. */
export function attachEditorCanvasPointerCapture(
  canvas: EditorPointerCaptureCanvas,
  onCancel: (event: PointerEvent) => void,
  onPointerDownBeforeFabric: (event: PointerEvent) => void = () => undefined,
  shouldCapture: (event: PointerEvent) => boolean = () => true
): void {
  detachEditorCanvasPointerCapture(canvas);
  const element = canvas.upperCanvasEl;
  const capture = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    onPointerDownBeforeFabric(event);
    if (!shouldCapture(event)) return;
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
  const finish = (event: PointerEvent) => release(event);
  const cancel = (event: PointerEvent) => {
    onCancel(event);
    release(event);
  };
  element.addEventListener('pointerdown', capture, true);
  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', cancel);
  pointerCaptureCleanup.set(canvas, () => {
    element.removeEventListener('pointerdown', capture, true);
    element.removeEventListener('pointerup', finish);
    element.removeEventListener('pointercancel', cancel);
  });
}

export function detachEditorCanvasPointerCapture(canvas: EditorPointerCaptureCanvas): void {
  pointerCaptureCleanup.get(canvas)?.();
  pointerCaptureCleanup.delete(canvas);
}
