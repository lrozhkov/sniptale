import type { EditorKeyboardAction, EditorKeyboardResolverOptions } from './keyboard-types';
import { normalizeHotkeyKey } from '../../../features/keyboard-shortcuts/hotkeys';

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
