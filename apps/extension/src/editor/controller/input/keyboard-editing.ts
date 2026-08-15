import type { EditorKeyboardAction, EditorKeyboardResolverOptions } from './keyboard-types';

export function resolveEditorDeleteKeyboardAction(
  options: Pick<EditorKeyboardResolverOptions, 'hasSelection' | 'key'>
): Extract<EditorKeyboardAction, 'delete-selection'> | null {
  if (options.key !== 'Delete' && options.key !== 'Backspace') {
    return null;
  }

  return options.hasSelection ? 'delete-selection' : null;
}

export function resolveEditorEnterKeyboardAction(
  options: Pick<
    EditorKeyboardResolverOptions,
    | 'hasCropGuide'
    | 'hasDrawSession'
    | 'hasSelectedTextTarget'
    | 'isEditingTextboxSelection'
    | 'isComposing'
    | 'key'
    | 'shiftKey'
  >
): Extract<
  EditorKeyboardAction,
  'apply-crop' | 'complete-draw' | 'enter-text-edit' | 'exit-text-edit'
> | null {
  if (options.key !== 'Enter') {
    return null;
  }

  if (options.isComposing) return null;

  if (options.hasDrawSession) {
    return 'complete-draw';
  }

  if (options.isEditingTextboxSelection) {
    return options.shiftKey ? null : 'exit-text-edit';
  }

  if (options.hasSelectedTextTarget) {
    return 'enter-text-edit';
  }

  return options.hasCropGuide ? 'apply-crop' : null;
}

export function resolveEditorFallbackKeyboardAction(
  options: Pick<
    EditorKeyboardResolverOptions,
    'code' | 'hasSelection' | 'isEditingTextboxSelection' | 'key'
  >
): EditorKeyboardAction {
  if (options.code === 'Space') {
    return 'space-down';
  }

  if (options.key === 'Escape') {
    return options.isEditingTextboxSelection ? 'cancel-text-edit' : 'cancel-transient';
  }

  const deleteAction = resolveEditorDeleteKeyboardAction(options);
  if (deleteAction) {
    return deleteAction;
  }

  return 'ignore';
}
