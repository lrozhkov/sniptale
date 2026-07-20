import { translate } from '../../../platform/i18n';
import {
  exportRichShapeDocumentObject,
  getRichShapeTextCapability,
} from '../../objects/rich-shape';
import { bindRichShapeTextEditorEvents } from './session-events';
import { hideShapeTextObjects, registerOverlayRefreshHandlers } from './session-lifecycle';
import { commitRichShapeTextEditor, refreshRichShapeTextEditor } from './session-commands';
import { applyTextareaRenderState } from './session-content';
import { findEditableShapeObject, setActiveRichShapeTextEditorSession } from './session-registry';
import type {
  RichShapeTextEditorOwner,
  RichShapeTextEditorStartOptions,
  TextEditorSession,
} from './session-types';

function handleTextareaInput(owner: RichShapeTextEditorOwner, session: TextEditorSession) {
  session.dirty = session.dirty || session.element.value !== session.originalText;
  const canvas = owner.canvas;
  const object = findEditableShapeObject(canvas, session.objectId);
  if (canvas && object) {
    applyTextareaRenderState(session.element, object, canvas);
  }
}

export function startRichShapeTextEditor(options: RichShapeTextEditorStartOptions): boolean {
  if (!getRichShapeTextCapability(options.object)) {
    return false;
  }

  commitRichShapeTextEditor(options.owner);
  options.canvas.setActiveObject(options.object);
  const shape = exportRichShapeDocumentObject(options.object);
  const element = document.createElement('textarea');
  element.value = shape.text.content;
  element.setAttribute('aria-label', translate('editor.compact.richShapeTextContent'));
  element.spellcheck = true;
  const session: TextEditorSession = {
    closing: false,
    cleanup: () => undefined,
    dirty: false,
    element,
    hiddenTextObjects: hideShapeTextObjects(options.object),
    objectId: options.object.sniptaleId ?? shape.id,
    originalText: shape.text.content,
  };
  setActiveRichShapeTextEditorSession(options.canvas, session);
  const cleanupRefreshHandlers = registerOverlayRefreshHandlers(options.canvas, () =>
    refreshRichShapeTextEditor(options.owner)
  );
  const commit = () => commitRichShapeTextEditor(options.owner);
  session.cleanup = bindRichShapeTextEditorEvents({
    canvas: options.canvas,
    cleanupRefreshHandlers,
    commit,
    element,
    onInput: () => handleTextareaInput(options.owner, session),
  });
  document.body.append(element);
  applyTextareaRenderState(element, options.object, options.canvas);
  element.focus({ preventScroll: true });
  element.select();
  options.canvas.requestRenderAll();
  options.owner.syncRuntimeState();
  return true;
}
