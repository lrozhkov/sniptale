import { isTextStyleKeyboardAction } from './action-kind';
import { applyEditorEditingKeyboardAction } from './editing-dispatch';
import type { EditorKeyboardAction, EditorKeyboardActionOptions } from './types';

export function applyEditorKeyboardAction(
  action: EditorKeyboardAction,
  options: EditorKeyboardActionOptions
): { preventDefault: boolean; nextSpacePressed?: boolean } {
  if (typeof action === 'object') {
    if (isTextStyleKeyboardAction(action)) {
      return { preventDefault: options.applyTextSelectionStyle?.(action.command) ?? false };
    }

    return { preventDefault: options.nudgeSelection?.(action) ?? false };
  }

  switch (action) {
    case 'space-down':
      return { preventDefault: true, nextSpacePressed: true };
    case 'undo':
      options.undo();
      return { preventDefault: true };
    case 'redo':
      options.redo();
      return { preventDefault: true };
    case 'duplicate-selection':
      options.duplicateSelection();
      return { preventDefault: true };
    case 'copy-raster-selection':
      options.copyRasterSelection();
      return { preventDefault: true };
    case 'cut-raster-selection':
      options.cutRasterSelection();
      return { preventDefault: true };
    case 'paste-raster-clipboard':
      options.pasteRasterClipboard();
      return { preventDefault: true };
    case 'ignore':
    case 'exit-text-edit':
    case 'cancel-transient':
    case 'delete-raster-selection':
    case 'delete-selection':
    case 'apply-crop':
    case 'complete-draw':
    case 'enter-text-edit':
      return applyEditorEditingKeyboardAction(action, options);
    default:
      return applyEditorEditingKeyboardAction(action, options);
  }
}
