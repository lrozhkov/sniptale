import type { EditorKeyboardAction, EditorKeyboardResolverOptions } from './keyboard-types';
import { resolveEditorDeleteKeyboardAction } from './keyboard-delete';

export function resolveEditorFallbackKeyboardAction(
  options: Pick<
    EditorKeyboardResolverOptions,
    | 'activeTool'
    | 'code'
    | 'hasRasterSelection'
    | 'hasSelection'
    | 'isEditingTextboxSelection'
    | 'key'
  >
): EditorKeyboardAction {
  if (options.code === 'Space') {
    return 'space-down';
  }

  if (options.key === 'Escape') {
    return options.isEditingTextboxSelection ? 'exit-text-edit' : 'cancel-transient';
  }

  const deleteAction = resolveEditorDeleteKeyboardAction(options);
  if (deleteAction) {
    return deleteAction;
  }

  return 'ignore';
}
