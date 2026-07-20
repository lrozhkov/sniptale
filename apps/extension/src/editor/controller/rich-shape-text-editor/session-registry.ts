import type { Canvas } from 'fabric';
import {
  getRichShapeTextCapability,
  isRichShapeObject,
  type RichShapeGroup,
} from '../../objects/rich-shape';
import { restoreShapeTextObjects } from './session-lifecycle';
import type { TextEditorSession } from './session-types';

const activeSessions = new WeakMap<Canvas, TextEditorSession>();

export function getActiveRichShapeTextEditorSession(
  canvas: Canvas | null
): TextEditorSession | null {
  return canvas ? (activeSessions.get(canvas) ?? null) : null;
}

export function setActiveRichShapeTextEditorSession(
  canvas: Canvas,
  session: TextEditorSession
): void {
  activeSessions.set(canvas, session);
}

export function findEditableShapeObject(
  canvas: Canvas | null,
  objectId: string
): RichShapeGroup | null {
  const object = canvas?.getObjects().find((candidate) => candidate.sniptaleId === objectId);
  return object && isRichShapeObject(object) && getRichShapeTextCapability(object) ? object : null;
}

export function isActiveShapeSelection(canvas: Canvas | null, objectId: string): boolean {
  return Boolean(canvas?.getActiveObjects().some((object) => object.sniptaleId === objectId));
}

export function closeRichShapeTextEditorSession(canvas: Canvas, session: TextEditorSession): void {
  if (session.closing) {
    return;
  }

  session.closing = true;
  session.cleanup();
  restoreShapeTextObjects(session.hiddenTextObjects);
  session.element.remove();
  if (activeSessions.get(canvas) === session) {
    activeSessions.delete(canvas);
  }
}
