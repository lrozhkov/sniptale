import type { Canvas } from 'fabric';
import { applyTextareaRenderState, applyTextContent } from './session-content';
import {
  closeRichShapeTextEditorSession,
  findEditableShapeObject,
  getActiveRichShapeTextEditorSession,
  isActiveShapeSelection,
} from './session-registry';
import type { RichShapeTextEditorOwner } from './session-types';

export function commitRichShapeTextEditor(owner: RichShapeTextEditorOwner): boolean {
  const canvas = owner.canvas;
  const session = getActiveRichShapeTextEditorSession(canvas);
  if (!canvas || !session || session.closing) {
    return false;
  }

  const object = findEditableShapeObject(canvas, session.objectId);
  const canCommit = Boolean(object);
  const changed = canCommit && session.element.value !== session.originalText;
  if (object && changed) {
    const applied = applyTextContent({
      object,
      textContent: session.element.value,
      withHistoryMuted: (callback) => owner.withHistoryMuted(callback),
    });
    canvas.requestRenderAll();
    if (applied || session.dirty) {
      owner.commitHistory();
    }
  }

  closeRichShapeTextEditorSession(canvas, session);
  owner.syncRuntimeState();
  return changed;
}

export function cancelRichShapeTextEditor(owner: RichShapeTextEditorOwner): boolean {
  const canvas = owner.canvas;
  const session = getActiveRichShapeTextEditorSession(canvas);
  if (!canvas || !session || session.closing) {
    return false;
  }

  const object = findEditableShapeObject(canvas, session.objectId);
  if (object) {
    applyTextContent({
      object,
      textContent: session.originalText,
      withHistoryMuted: (callback) => owner.withHistoryMuted(callback),
    });
    canvas.requestRenderAll();
  }

  closeRichShapeTextEditorSession(canvas, session);
  owner.syncRuntimeState();
  return true;
}

export function refreshRichShapeTextEditor(owner: RichShapeTextEditorOwner): boolean {
  const canvas = owner.canvas;
  const session = getActiveRichShapeTextEditorSession(canvas);
  if (!canvas || !session || session.closing) {
    return false;
  }

  const object = findEditableShapeObject(canvas, session.objectId);
  if (!object) {
    closeRichShapeTextEditorSession(canvas, session);
    return false;
  }
  if (!isActiveShapeSelection(canvas, session.objectId)) {
    commitRichShapeTextEditor(owner);
    return false;
  }

  return applyTextareaRenderState(session.element, object, canvas);
}

export function refreshRichShapeTextEditorForCanvas(canvas: Canvas | null): boolean {
  return refreshRichShapeTextEditor({
    canvas,
    commitHistory: () => undefined,
    syncRuntimeState: () => undefined,
    withHistoryMuted: (callback) => callback(),
  });
}
