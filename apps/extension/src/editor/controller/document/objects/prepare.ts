import { type FabricObject, type Textbox } from 'fabric';
import { isGroup, isTextbox } from '../../core/helpers';
import { applyEditorObjectInteractionControls } from '../interaction-controls/apply';
import { refreshPreparedObjectGeometry } from './geometry-refresh';
import { applyBaseInteractionPatch } from './interaction-patches';
import { applyLineLikeRichShapeControls } from './rich-shape-controls';
import { attachEditorTextboxLifecycle } from './textbox-lifecycle';
import { applyEditorDrawingInteractionControls } from '../../../drawing/object/controls/apply';
import { applyEditorDrawingTextVisuals } from '../../../drawing/object/vector';

export function prepareEditorObject(
  object: FabricObject,
  options: {
    onTextboxExitEmpty: (textbox: Textbox) => void;
    onTextboxExitCommit: (textbox: Textbox) => void;
  }
): void {
  const locked = Boolean(object.sniptaleLocked);
  applyBaseInteractionPatch(object, { arrowInteraction: null, arrowObject: false, locked });
  applyEditorObjectInteractionControls(object);

  if (isGroup(object)) {
    object.getObjects().forEach((child) => child.set({ selectable: false, evented: false }));
  }
  applyLineLikeRichShapeControls(object);

  if (isTextbox(object)) {
    if (object.sniptaleType === 'text') applyEditorDrawingTextVisuals(object);
    attachEditorTextboxLifecycle(object, {
      onEmpty: () => options.onTextboxExitEmpty(object),
      onCommit: options.onTextboxExitCommit,
    });
  }

  refreshPreparedObjectGeometry(object);
  applyEditorObjectInteractionControls(object);
  applyEditorDrawingInteractionControls(object);
}
