import { normalizeHotkeyKey } from '../../../features/keyboard-shortcuts/hotkeys';
import type { EditorKeyboardAction, EditorKeyboardResolverOptions } from './keyboard-types';

export function resolveEditorHistoryKeyboardAction(
  options: Pick<
    EditorKeyboardResolverOptions,
    | 'activeTool'
    | 'altKey'
    | 'code'
    | 'ctrlKey'
    | 'hasRasterSelection'
    | 'hasSelection'
    | 'key'
    | 'metaKey'
    | 'shiftKey'
  >
): Exclude<EditorKeyboardAction, { type: 'text-style' }> | null {
  if ((!options.ctrlKey && !options.metaKey) || options.altKey) {
    return null;
  }

  const key = normalizeHotkeyKey(options.key, options.code).toLowerCase();
  if (options.activeTool === 'selection') {
    if (key === 'v') {
      return 'paste-raster-clipboard';
    }
    if (options.hasRasterSelection && key === 'c') {
      return 'copy-raster-selection';
    }
    if (options.hasRasterSelection && key === 'x') {
      return 'cut-raster-selection';
    }
  }

  if (key === 'z') {
    return options.shiftKey ? 'redo' : 'undo';
  }

  if (key === 'y') {
    return 'redo';
  }

  if (key === 'd' && options.hasSelection) {
    return 'duplicate-selection';
  }

  return null;
}

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
