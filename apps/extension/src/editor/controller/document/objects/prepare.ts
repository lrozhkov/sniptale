import { type FabricObject, type Textbox } from 'fabric';
import { isGroup, isTextbox } from '../../core/helpers';
import {
  getArrowInteractionAppearance,
  getArrowSettings,
  isArrowObject,
} from '../../../objects/arrow';
import { applyTextCalloutRendering } from '../../../objects/annotation/text/callout/lifecycle';
import { applyEditorObjectInteractionControls } from '../interaction-controls';
import { refreshPreparedObjectGeometry } from './geometry-refresh';
import { applyBaseInteractionPatch } from './interaction-patches';
import { applyLineLikeRichShapeControls } from './rich-shape-controls';
import { attachEditorTextboxLifecycle } from './textbox-lifecycle';

export function prepareEditorObject(
  object: FabricObject,
  options: {
    onTextboxExitEmpty: (textbox: Textbox) => void;
    onTextboxExitCommit: (textbox: Textbox) => void;
  }
): void {
  const locked = Boolean(object.sniptaleLocked);
  const arrowObject = isArrowObject(object);
  const arrowSettings = arrowObject ? getArrowSettings(object) : null;
  const arrowInteraction = arrowSettings ? getArrowInteractionAppearance(arrowSettings) : null;

  applyBaseInteractionPatch(object, { arrowInteraction, arrowObject, locked });
  applyEditorObjectInteractionControls(object);

  if (isGroup(object)) {
    object.getObjects().forEach((child) => child.set({ selectable: false, evented: false }));
  }
  applyLineLikeRichShapeControls(object);

  if (isTextbox(object)) {
    if (object.sniptaleType === 'text' || object.sniptaleType === 'meta-stamp') {
      applyTextCalloutRendering(object);
    }
    attachEditorTextboxLifecycle(object, {
      onEmpty: () => options.onTextboxExitEmpty(object),
      onCommit: options.onTextboxExitCommit,
    });
  }

  refreshPreparedObjectGeometry(object, arrowSettings);
  applyEditorObjectInteractionControls(object);
}
