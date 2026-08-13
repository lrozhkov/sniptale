import { isTextbox } from '../../core/helpers';
import { activateTextTarget, isTextTarget } from '../../events/text-target';
import { cancelEditorTextboxEditing } from '../../document/objects/textbox-lifecycle';
import type { EditorKeyboardActionOptions } from './types';

export function exitTextboxEditing(options: EditorKeyboardActionOptions): void {
  if (options.activeObject && isTextbox(options.activeObject)) {
    options.activeObject.exitEditing();
  }

  options.canvas?.requestRenderAll();
}

export function cancelTextboxEditing(options: EditorKeyboardActionOptions): void {
  if (options.activeObject && isTextbox(options.activeObject)) {
    cancelEditorTextboxEditing(options.activeObject);
  }
  options.canvas?.requestRenderAll();
  options.syncRuntimeState?.();
}

export function enterSelectedTextEditing(options: EditorKeyboardActionOptions): void {
  if (!options.canvas || !options.activeObject || !isTextTarget(options.activeObject)) {
    return;
  }

  activateTextTarget(
    options.canvas,
    options.activeObject,
    options.syncRuntimeState ?? (() => undefined),
    {
      selectAll: false,
    }
  );
}
