import type { EditorKeyboardAction, EditorKeyboardResolverOptions } from './keyboard-types';
import { resolveEditorKeyboardNudge } from './keyboard-nudge';
import {
  resolveEditorEnterKeyboardAction,
  resolveEditorFallbackKeyboardAction,
} from './keyboard-editing';
import {
  resolveEditorHistoryKeyboardAction,
  resolveTextStyleKeyboardAction,
} from './keyboard-shortcuts';

export function resolveEditorKeyboardAction(
  options: EditorKeyboardResolverOptions
): EditorKeyboardAction {
  if (!options.hasCanvas) {
    return 'ignore';
  }

  if (options.targetIsInteractive && !options.isEditingTextboxInput) {
    return 'ignore';
  }
  if (options.isEditingTextboxSelection && !options.isEditingTextboxInput) {
    return 'ignore';
  }

  const textStyleAction = resolveTextStyleKeyboardAction({
    ...options,
    isEditingTextboxSelection: options.isEditingTextboxInput,
  });
  if (textStyleAction) {
    return textStyleAction;
  }

  if (options.isEditingTextboxInput) {
    if (options.key === 'Enter') {
      const modified =
        options.shiftKey ||
        options.isComposing ||
        options.ctrlKey ||
        options.metaKey ||
        options.altKey;
      return modified ? 'ignore' : 'exit-text-edit';
    }
    return options.key === 'Escape' ? resolveEditorFallbackKeyboardAction(options) : 'ignore';
  }

  const nudge = resolveEditorKeyboardNudge(options);
  if (nudge) {
    return nudge;
  }

  const historyAction = resolveEditorHistoryKeyboardAction(options);
  if (historyAction) {
    return historyAction;
  }

  const enterAction = resolveEditorEnterKeyboardAction(options);
  if (enterAction) {
    return enterAction;
  }

  return resolveEditorFallbackKeyboardAction(options);
}

export function isEditorSpaceKey(eventCode: string): boolean {
  return eventCode === 'Space';
}
