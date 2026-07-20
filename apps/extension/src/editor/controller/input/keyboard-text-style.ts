import type { EditorKeyboardAction, EditorKeyboardResolverOptions } from './keyboard-types';
import { normalizeHotkeyKey } from '../../../features/keyboard-shortcuts/hotkeys';

export function resolveTextStyleKeyboardAction(
  options: Pick<
    EditorKeyboardResolverOptions,
    | 'altKey'
    | 'code'
    | 'ctrlKey'
    | 'hasSelectedTextTarget'
    | 'isEditingTextboxSelection'
    | 'key'
    | 'metaKey'
  >
): Extract<EditorKeyboardAction, { type: 'text-style' }> | null {
  if ((!options.ctrlKey && !options.metaKey) || options.altKey) {
    return null;
  }
  if (!options.isEditingTextboxSelection && !options.hasSelectedTextTarget) {
    return null;
  }

  switch (normalizeHotkeyKey(options.key, options.code).toLowerCase()) {
    case 'b':
      return { type: 'text-style', command: 'bold' };
    case 'i':
      return { type: 'text-style', command: 'italic' };
    case 's':
      return { type: 'text-style', command: 'linethrough' };
    case 'u':
      return { type: 'text-style', command: 'underline' };
    default:
      return null;
  }
}
