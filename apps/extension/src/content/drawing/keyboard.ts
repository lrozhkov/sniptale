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
