import { useEffect, type RefObject } from 'react';
import {
  translateDrawingObject,
  type DrawingSession,
  type DrawingSessionSnapshot,
  type DrawingTextObject,
} from '../../features/drawing/public';

export function handleDrawingKeyDown(args: {
  event: {
    key: string;
    shiftKey: boolean;
    preventDefault(): void;
  };
  hasDraft: boolean;
  onCancelDraft: () => void;
  onEditText: (object: DrawingTextObject) => void;
  onExit?: () => void;
  session: DrawingSession;
  snapshot: DrawingSessionSnapshot;
}): void {
  const { event, session, snapshot } = args;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    session.deleteSelected();
    return;
  }
  const selected = snapshot.document.objects.filter((object) =>
    snapshot.selectedObjectIds.includes(object.id)
  );
  if (event.key.startsWith('Arrow') && selected.length > 0) {
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const delta =
      event.key === 'ArrowLeft'
        ? { x: -amount, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: amount, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -amount }
            : { x: 0, y: amount };
    session.replaceObjects(selected.map((object) => translateDrawingObject(object, delta)));
    return;
  }
  const editableText = selected.length === 1 && selected[0]?.kind === 'text' ? selected[0] : null;
  if (event.key === 'Enter' && editableText) {
    event.preventDefault();
    args.onEditText(editableText);
    return;
  }
  if (event.key !== 'Escape') return;
  event.preventDefault();
  if (args.hasDraft) args.onCancelDraft();
  else if (snapshot.selectedObjectIds.length > 0) session.select(null);
  else if (snapshot.activeTool !== 'select') session.setActiveTool('select');
  else args.onExit?.();
}

function isDrawingEditableKeyboardTarget(event: KeyboardEvent): boolean {
  return event
    .composedPath()
    .some(
      (target) =>
        target instanceof Element &&
        target.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    );
}

export function useDrawingEscapeOwnership(args: {
  active: boolean;
  cancelDraft: () => void;
  cancelText: () => void;
  editText: (object: DrawingTextObject) => void;
  hasTextDraft: boolean;
  exitImmediately?: boolean;
  onExit?: () => void;
  pointerDraftRef: RefObject<unknown | null>;
  session: DrawingSession;
}) {
  useEffect(() => {
    if (!args.active) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        isDrawingEditableKeyboardTarget(event)
      ) {
        return;
      }
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (args.exitImmediately) {
        event.preventDefault();
        args.cancelDraft();
        args.cancelText();
        args.session.select(null);
        args.session.setActiveTool('select');
        args.onExit?.();
        return;
      }
      handleDrawingKeyDown({
        event,
        hasDraft: Boolean(args.pointerDraftRef.current || args.hasTextDraft),
        onCancelDraft: () => {
          args.cancelDraft();
          args.cancelText();
        },
        onEditText: args.editText,
        ...(args.onExit === undefined ? {} : { onExit: args.onExit }),
        session: args.session,
        snapshot: args.session.getSnapshot(),
      });
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [args]);
}
