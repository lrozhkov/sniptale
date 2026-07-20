import type { EditorKeyboardAction, EditorKeyboardResolverOptions } from './keyboard-types';

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
