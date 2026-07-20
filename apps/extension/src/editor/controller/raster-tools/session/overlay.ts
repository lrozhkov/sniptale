import type { EditorRasterToolSessionState } from '../types';

export function subscribeEditorRasterOverlay(
  session: EditorRasterToolSessionState,
  listener: () => void
): () => void {
  session.overlayListeners.add(listener);
  return () => {
    session.overlayListeners.delete(listener);
  };
}

export function notifyEditorRasterOverlay(session: EditorRasterToolSessionState): void {
  session.overlayListeners.forEach((listener) => listener());
}
