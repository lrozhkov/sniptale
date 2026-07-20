import type { EditorKeyboardAction, EditorTextStyleKeyboardAction } from './types';

export function isTextStyleKeyboardAction(
  action: EditorKeyboardAction
): action is EditorTextStyleKeyboardAction {
  return typeof action === 'object' && 'type' in action && action.type === 'text-style';
}
