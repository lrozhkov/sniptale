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

export function resolveEditorEnterKeyboardAction(
  options: Pick<
    EditorKeyboardResolverOptions,
    'hasCropGuide' | 'hasDrawSession' | 'hasSelectedTextTarget' | 'key'
  >
): Extract<EditorKeyboardAction, 'apply-crop' | 'complete-draw' | 'enter-text-edit'> | null {
  if (options.key !== 'Enter') {
    return null;
  }

  if (options.hasDrawSession) {
    return 'complete-draw';
  }

  if (options.hasSelectedTextTarget) {
    return 'enter-text-edit';
  }

  return options.hasCropGuide ? 'apply-crop' : null;
}

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
