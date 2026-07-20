import { createSelectionNudge, type EditorSelectionNudge } from '../tools/nudge';
import type { EditorKeyboardResolverOptions } from './keyboard-types';

export function resolveEditorKeyboardNudge(
  options: Pick<
    EditorKeyboardResolverOptions,
    | 'altKey'
    | 'code'
    | 'ctrlKey'
    | 'hasSelection'
    | 'isEditingTextboxSelection'
    | 'metaKey'
    | 'shiftKey'
  >
): EditorSelectionNudge | null {
  if (
    options.ctrlKey ||
    options.metaKey ||
    options.altKey ||
    !options.hasSelection ||
    options.isEditingTextboxSelection
  ) {
    return null;
  }

  return createSelectionNudge(options.code, options.shiftKey);
}
