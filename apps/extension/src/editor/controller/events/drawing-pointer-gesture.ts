import type { TPointerEvent } from 'fabric';
import { endEditorCanvasTransform } from '../input/canvas-actions';

interface EditorDrawingPointerGesture {
  cancel(event?: TPointerEvent): void;
  finish(event?: TPointerEvent): boolean;
  queue(event: TPointerEvent): void;
  start(event: TPointerEvent): void;
}

interface EditorDrawingPointerGestureBindings {
  cancelTransientInteraction(): boolean;
  getCanvas(): Parameters<typeof endEditorCanvasTransform>[0];
}

export function createEditorDrawingPointerGesture(
  bindings: EditorDrawingPointerGestureBindings,
  updateDraft: (events: readonly TPointerEvent[]) => void,
  hasActiveDrawSession: () => boolean
): EditorDrawingPointerGesture {
  let lastHandledMoveEvent: TPointerEvent | null = null;
  let active = false;
  let terminal = false;
  let activePointerId: number | null = null;
  let pendingMoveEvents: TPointerEvent[] = [];
  let moveFrame = 0;
  const flush = () => {
    if (moveFrame !== 0) {
      cancelAnimationFrame(moveFrame);
      moveFrame = 0;
    }
    const events = pendingMoveEvents;
    pendingMoveEvents = [];
    if (events.length > 0) updateDraft(events);
  };
  const clear = () => {
    active = false;
    terminal = true;
    activePointerId = null;
    lastHandledMoveEvent = null;
  };
  const readPointerId = (event?: TPointerEvent) =>
    event && 'pointerId' in event ? event.pointerId : null;

  return {
    cancel(event) {
      if (!active && (terminal || !hasActiveDrawSession())) return;
      if (activePointerId !== null && readPointerId(event) !== activePointerId) return;
      const shouldCancelTransientInteraction = hasActiveDrawSession();
      if (moveFrame !== 0) cancelAnimationFrame(moveFrame);
      moveFrame = 0;
      pendingMoveEvents = [];
      clear();
      endEditorCanvasTransform(bindings.getCanvas(), event);
      if (shouldCancelTransientInteraction) bindings.cancelTransientInteraction();
    },
    finish(event) {
      if (!active) return false;
      if (activePointerId !== null && readPointerId(event) !== activePointerId) return false;
      flush();
      clear();
      return true;
    },
    queue(event) {
      if (!hasActiveDrawSession()) return;
      if (lastHandledMoveEvent === event) return;
      if (activePointerId !== null && 'pointerId' in event && event.pointerId !== activePointerId) {
        return;
      }
      lastHandledMoveEvent = event;
      if (!('pointerId' in event)) {
        updateDraft([event]);
        return;
      }
      pendingMoveEvents.push(event);
      if (moveFrame !== 0) return;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        flush();
      });
    },
    start(event) {
      if (moveFrame !== 0) cancelAnimationFrame(moveFrame);
      moveFrame = 0;
      pendingMoveEvents = [];
      lastHandledMoveEvent = null;
      active = true;
      terminal = false;
      activePointerId = 'pointerId' in event ? event.pointerId : null;
    },
  };
}
