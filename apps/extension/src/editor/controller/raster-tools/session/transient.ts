import type { EditorRasterToolSessionState } from '../types';
import { notifyEditorRasterOverlay } from './overlay';

export function clearEditorRasterTransientState(session: EditorRasterToolSessionState): boolean {
  const changed = Boolean(
    session.marqueeDraft ||
    session.lassoDraft ||
    session.gradientDraft ||
    session.eraserDraft ||
    session.brushDraft ||
    session.hoverCursor
  );
  session.marqueeDraft = null;
  session.lassoDraft = null;
  session.gradientDraft = null;
  session.eraserDraft = null;
  session.brushDraft = null;
  session.hoverCursor = null;
  return changed;
}

export function clearEditorRasterHoverCursor(session: EditorRasterToolSessionState): boolean {
  if (!session.hoverCursor) {
    return false;
  }

  session.hoverCursor = null;
  notifyEditorRasterOverlay(session);
  return true;
}

export function isEditorRasterSessionBoundToTarget(
  session: EditorRasterToolSessionState,
  targetId: string | null
): boolean {
  if (!targetId) {
    return false;
  }

  return (
    session.selection?.reference.objectId === targetId ||
    session.marqueeDraft?.snapshot.reference.objectId === targetId ||
    session.lassoDraft?.snapshot.reference.objectId === targetId ||
    session.gradientDraft?.snapshot.reference.objectId === targetId ||
    session.eraserDraft?.snapshot.reference.objectId === targetId ||
    session.brushDraft?.snapshot.reference.objectId === targetId
  );
}
