import type { EditorKeyboardAction, EditorKeyboardResolverOptions } from './keyboard-types';

export function resolveEditorDeleteKeyboardAction(
  options: Pick<
    EditorKeyboardResolverOptions,
    'activeTool' | 'hasRasterSelection' | 'hasSelection' | 'key'
  >
): Extract<EditorKeyboardAction, 'delete-raster-selection' | 'delete-selection'> | null {
  if (options.key !== 'Delete' && options.key !== 'Backspace') {
    return null;
  }

  if (options.activeTool === 'selection' && options.hasRasterSelection) {
    return 'delete-raster-selection';
  }

  return options.hasSelection ? 'delete-selection' : null;
}
