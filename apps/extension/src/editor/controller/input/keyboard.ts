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

  const textStyleAction = resolveTextStyleKeyboardAction(options);
  if (textStyleAction) {
    return textStyleAction;
  }

  if (options.targetIsInteractive) {
    return 'ignore';
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
