import { enterSelectedTextEditing, exitTextboxEditing } from './text-editing';
import type { EditorKeyboardAction, EditorKeyboardActionOptions } from './types';

export function applyEditorEditingKeyboardAction(
  action: Exclude<EditorKeyboardAction, object>,
  options: EditorKeyboardActionOptions
): { preventDefault: boolean } {
  switch (action) {
    case 'exit-text-edit':
      exitTextboxEditing(options);
      return { preventDefault: true };
    case 'cancel-transient':
      return { preventDefault: options.cancelTransientInteraction() };
    case 'delete-raster-selection':
      options.deleteRasterSelectionPixels();
      return { preventDefault: true };
    case 'delete-selection':
      options.deleteSelection();
      return { preventDefault: true };
    case 'apply-crop':
      options.applyCropSelection();
      return { preventDefault: true };
    case 'complete-draw':
      return { preventDefault: options.completeDrawSession?.() ?? false };
    case 'enter-text-edit':
      enterSelectedTextEditing(options);
      return { preventDefault: true };
    case 'ignore':
      return { preventDefault: false };
    case 'undo':
    case 'redo':
    case 'space-down':
    case 'copy-raster-selection':
    case 'cut-raster-selection':
    case 'paste-raster-clipboard':
    case 'duplicate-selection':
      return { preventDefault: false };
  }
}
