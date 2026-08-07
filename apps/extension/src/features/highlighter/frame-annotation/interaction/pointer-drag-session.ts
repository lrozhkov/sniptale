export interface PointerDragStartEvent {
  button: number;
  currentTarget: { setPointerCapture(pointerId: number): void };
  nativeEvent: { stopImmediatePropagation(): void };
  pointerId: number;
  preventDefault(): void;
  stopPropagation(): void;
}

type PointerDragEvent = Pick<PointerEvent, 'pointerId' | 'preventDefault' | 'stopPropagation'>;

export function acceptPointerDragEvent(event: PointerDragEvent, pointerId: number | null): boolean {
  if (event.pointerId !== pointerId) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function finishPointerDragEvent(
  event: PointerDragEvent,
  pointerIdRef: { current: number | null },
  onFinish: () => void
): boolean {
  if (!acceptPointerDragEvent(event, pointerIdRef.current)) return false;
  pointerIdRef.current = null;
  onFinish();
  return true;
}

export function commitPointerDragDraft<T>(args: {
  draftRef: { current: T | null };
  event: PointerDragEvent;
  initialValue: T | null | undefined;
  isEqual(left: T, right: T | null | undefined): boolean;
  onClear(): void;
  onCommit(value: T): void;
  onFinish(): void;
  pointerIdRef: { current: number | null };
}): void {
  if (!finishPointerDragEvent(args.event, args.pointerIdRef, args.onFinish)) return;
  const draft = args.draftRef.current;
  if (draft === null) return;
  if (args.isEqual(draft, args.initialValue)) {
    args.draftRef.current = null;
    args.onClear();
  }
  args.onCommit(draft);
}

export function registerPointerDragSession(args: {
  cancel(): boolean | void;
  cancelOnLostPointerCapture?: boolean;
  move(event: PointerEvent): void;
  up(event: PointerEvent): void;
}): () => void {
  const cancel = () => {
    args.cancel();
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !args.cancel()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  document.addEventListener('pointermove', args.move, { capture: true });
  document.addEventListener('pointerup', args.up, { capture: true });
  document.addEventListener('pointercancel', cancel, { capture: true });
  if (args.cancelOnLostPointerCapture !== false) {
    document.addEventListener('lostpointercapture', cancel, { capture: true });
  }
  window.addEventListener('keydown', handleKeyDown, { capture: true });
  window.addEventListener('blur', cancel);
  return () => {
    document.removeEventListener('pointermove', args.move, { capture: true });
    document.removeEventListener('pointerup', args.up, { capture: true });
    document.removeEventListener('pointercancel', cancel, { capture: true });
    if (args.cancelOnLostPointerCapture !== false) {
      document.removeEventListener('lostpointercapture', cancel, { capture: true });
    }
    window.removeEventListener('keydown', handleKeyDown, { capture: true });
    window.removeEventListener('blur', cancel);
  };
}
