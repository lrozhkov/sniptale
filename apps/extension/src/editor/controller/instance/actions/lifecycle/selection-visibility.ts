import type { Canvas, FabricObject } from 'fabric';
import { useEditorStore } from '../../../../state/useEditorStore';

/** Keeps Fabric's hit regions intact while only the selection chrome fades. */
export function mountSelectionVisibility(canvas: Canvas, selection: SVGElement): () => void {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let dragging = false;
  let keepBorder = false;
  let pressedAt: { x: number; y: number } | null = null;
  const originalSetCursor = canvas.setCursor;
  let desiredCursor = canvas.upperCanvasEl.style.cursor;

  canvas.setCursor = (value) => {
    desiredCursor = value;
    originalSetCursor.call(
      canvas,
      dragging && useEditorStore.getState().workspace.hideSelectionWhileDragging ? 'none' : value
    );
  };

  const setDragging = (next: boolean, preserveBorder = false) => {
    if (dragging === next && keepBorder === preserveBorder) return;
    dragging = next;
    keepBorder = preserveBorder;
    const enabled = useEditorStore.getState().workspace.hideSelectionWhileDragging;
    selection.style.transition = reducedMotion?.matches
      ? 'none'
      : `opacity ${next ? 150 : 50}ms ease-out`;
    selection.style.opacity = next && enabled && !keepBorder ? '0' : '1';
    selection.style.setProperty(
      '--editor-selection-controls-opacity',
      next && enabled && keepBorder ? '0' : '1'
    );
    originalSetCursor.call(canvas, next && enabled ? 'none' : desiredCursor);
  };

  const onMouseDown = ({ e }: { e: Event }) => {
    const pointer = e as MouseEvent;
    pressedAt = pointer.button === 0 ? { x: pointer.clientX, y: pointer.clientY } : null;
  };
  const onTransform = ({ target, e }: { target: FabricObject; e?: Event }, resize = false) => {
    if (target !== canvas.getActiveObject() || target.sniptaleType === 'text') return;
    const pointer = e as MouseEvent | undefined;
    if (
      pressedAt &&
      pointer &&
      Math.hypot(pointer.clientX - pressedAt.x, pointer.clientY - pressedAt.y) < 4
    )
      return;
    setDragging(true, resize && target.sniptaleType === 'simplify');
  };
  const onRelease = () => {
    pressedAt = null;
    setDragging(false);
  };
  const unsubscribePreference = useEditorStore.subscribe((state, previous) => {
    if (
      state.workspace.hideSelectionWhileDragging !== previous.workspace.hideSelectionWhileDragging
    ) {
      setDragging(false);
    }
  });
  const unsubscribeMouseDown = canvas.on('mouse:down', onMouseDown);
  const unsubscribeMoving = canvas.on('object:moving', onTransform);
  const unsubscribeRotating = canvas.on('object:rotating', onTransform);
  const unsubscribeMouseMove = canvas.on('mouse:move', ({ e }) => {
    const transform = canvas._currentTransform;
    if (transform?.action?.startsWith('modifyDrawingArrow'))
      onTransform({ target: transform.target, e });
  });
  const onResize = (event: { target: FabricObject; e?: Event }) => onTransform(event, true);
  const unsubscribeScaling = canvas.on('object:scaling', onResize);
  const unsubscribeResizing = canvas.on('object:resizing', onResize);
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
    unsubscribeMoving();
    unsubscribeRotating();
    unsubscribeMouseMove();
    unsubscribeMouseUp();
    unsubscribeScaling();
    unsubscribeResizing();
    window.removeEventListener('pointerup', onRelease);
    window.removeEventListener('pointercancel', onRelease);
    window.removeEventListener('blur', onRelease);
    canvas.upperCanvasEl.removeEventListener('lostpointercapture', onRelease);
  };
}
