import type { Canvas } from 'fabric';

type EditorPointerCaptureCanvas = Pick<Canvas, 'upperCanvasEl'>;

const pointerCaptureCleanup = new WeakMap<EditorPointerCaptureCanvas, () => void>();

/** Keeps a fast object transform bound to the Fabric canvas until pointer release. */
export function attachEditorCanvasPointerCapture(
  canvas: EditorPointerCaptureCanvas,
  onUnexpectedLoss: (event: PointerEvent) => void,
  onPointerDownBeforeFabric: (event: PointerEvent) => void = () => undefined
): void {
  detachEditorCanvasPointerCapture(canvas);
  const element = canvas.upperCanvasEl;
  const expectedLosses = new Set<number>();
  const capture = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    onPointerDownBeforeFabric(event);
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already have ended before capture is established.
    }
  };
  const release = (event: PointerEvent, expected: boolean) => {
    try {
      if (element.hasPointerCapture(event.pointerId)) {
        if (expected) expectedLosses.add(event.pointerId);
        element.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Lost capture is already the desired terminal state.
    }
  };
  const finish = (event: PointerEvent) => release(event, true);
  const cancel = (event: PointerEvent) => {
    onUnexpectedLoss(event);
    release(event, true);
  };
  const lost = (event: PointerEvent) => {
    if (expectedLosses.delete(event.pointerId)) return;
    onUnexpectedLoss(event);
  };
  element.addEventListener('pointerdown', capture, true);
  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('lostpointercapture', lost);
  pointerCaptureCleanup.set(canvas, () => {
    element.removeEventListener('pointerdown', capture, true);
    element.removeEventListener('pointerup', finish);
    element.removeEventListener('pointercancel', cancel);
    element.removeEventListener('lostpointercapture', lost);
    expectedLosses.clear();
  });
}

export function detachEditorCanvasPointerCapture(canvas: EditorPointerCaptureCanvas): void {
  pointerCaptureCleanup.get(canvas)?.();
  pointerCaptureCleanup.delete(canvas);
}
