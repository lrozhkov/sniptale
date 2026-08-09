import type { KeyboardEvent } from 'react';
import {
  translateDrawingObject,
  type DrawingSession,
  type DrawingSessionSnapshot,
  type DrawingTextObject,
} from '../../features/drawing/public';

export function handleDrawingKeyDown(args: {
  event: KeyboardEvent<HTMLCanvasElement>;
  hasDraft: boolean;
  onCancelDraft: () => void;
  onEditText: (object: DrawingTextObject) => void;
  onExit?: () => void;
  session: DrawingSession;
  snapshot: DrawingSessionSnapshot;
}): void {
  const { event, session, snapshot } = args;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) session.redo();
    else session.undo();
    return;
  }
  if (modifier && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    session.redo();
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    session.deleteSelected();
    return;
  }
  const selected = snapshot.document.objects.find(
    (object) => object.id === snapshot.selectedObjectId
  );
  if (event.key.startsWith('Arrow') && selected) {
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
    session.replaceObject(translateDrawingObject(selected, delta));
    return;
  }
  if (event.key === 'Enter' && selected?.kind === 'text') {
    event.preventDefault();
    args.onEditText(selected);
    return;
  }
  if (event.key !== 'Escape') return;
  event.preventDefault();
  if (args.hasDraft) args.onCancelDraft();
  else if (snapshot.selectedObjectId) session.select(null);
  else args.onExit?.();
}
