import type { Canvas, FabricObject } from 'fabric';
import { useEditorStore } from '../../../../state/useEditorStore';

/** Keeps Fabric's hit regions intact while only the selection chrome fades. */
export function mountSelectionVisibility(canvas: Canvas, selection: SVGElement): () => void {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let dragging = false;
  const originalSetCursor = canvas.setCursor;
  let desiredCursor = canvas.upperCanvasEl.style.cursor;

  canvas.setCursor = (value) => {
    desiredCursor = value;
    originalSetCursor.call(
      canvas,
      dragging && useEditorStore.getState().workspace.hideSelectionWhileDragging ? 'none' : value
    );
  };

  const setDragging = (next: boolean) => {
    if (dragging === next) return;
    dragging = next;
    const enabled = useEditorStore.getState().workspace.hideSelectionWhileDragging;
    selection.style.transition = reducedMotion?.matches
      ? 'none'
      : `opacity ${next ? 150 : 50}ms ease-out`;
    selection.style.opacity = next && enabled ? '0' : '1';
    originalSetCursor.call(canvas, next && enabled ? 'none' : desiredCursor);
  };

  const onMouseDown = (event: { e?: Event; target?: FabricObject }) => {
    const pointer = event.e as MouseEvent | undefined;
    if (pointer?.button !== 0 || !event.target) return;
    const active = canvas.getActiveObject();
    if (active !== event.target || active.sniptaleType === 'text') return;
    setDragging(true);
  };
  const onRelease = () => setDragging(false);
  const unsubscribePreference = useEditorStore.subscribe((state, previous) => {
    if (
      state.workspace.hideSelectionWhileDragging !== previous.workspace.hideSelectionWhileDragging
    ) {
      setDragging(false);
    }
  });
  const unsubscribeMouseDown = canvas.on('mouse:down', onMouseDown);
  const unsubscribeMouseUp = canvas.on('mouse:up', onRelease);
  window.addEventListener('pointerup', onRelease);
  window.addEventListener('pointercancel', onRelease);
  window.addEventListener('blur', onRelease);
  canvas.upperCanvasEl.addEventListener('lostpointercapture', onRelease);

  return () => {
    setDragging(false);
    canvas.setCursor = originalSetCursor;
    unsubscribePreference();
    unsubscribeMouseDown();
    unsubscribeMouseUp();
    window.removeEventListener('pointerup', onRelease);
    window.removeEventListener('pointercancel', onRelease);
    window.removeEventListener('blur', onRelease);
    canvas.upperCanvasEl.removeEventListener('lostpointercapture', onRelease);
  };
}
