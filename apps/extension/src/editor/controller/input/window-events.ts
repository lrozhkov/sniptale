import type { Canvas } from 'fabric';

import { isEditableObject } from '../../document/model';
import { isInteractiveShortcutTarget, isTextbox } from '../core/helpers';
import { isTextTarget } from '../events/text-target';
import { applyEditorKeyboardAction } from './keyboard-action-runner/dispatch';
import type { EditorKeyboardCommandCallbacks } from './keyboard-action-runner/types';
import { isEditorSpaceKey, resolveEditorKeyboardAction } from './keyboard';

type EditorWindowKeyDownOptions = EditorKeyboardCommandCallbacks & {
  canvas: Canvas | null;
  target: EventTarget | null;
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  activeTool: string;
  hasCropGuide: boolean;
  hasDrawSession?: boolean;
};

export function handleEditorWindowBlur(options: { finalizeSelectionNudge?: () => void }): void {
  options.finalizeSelectionNudge?.();
}

export function handleEditorWindowKeyDown(options: EditorWindowKeyDownOptions): {
  preventDefault: boolean;
  nextSpacePressed?: boolean;
} {
  const activeObject = options.canvas?.getActiveObject();
  const action = resolveEditorKeyboardAction({
    hasCanvas: Boolean(options.canvas),
    targetIsInteractive: isInteractiveShortcutTarget(options.target),
    code: options.code,
    key: options.key,
    ctrlKey: options.ctrlKey,
    metaKey: options.metaKey,
    altKey: options.altKey,
    shiftKey: options.shiftKey,
    hasSelection: Boolean(options.canvas?.getActiveObjects().filter(isEditableObject).length),
    hasCropGuide: options.hasCropGuide,
    ...(options.hasDrawSession === undefined ? {} : { hasDrawSession: options.hasDrawSession }),
    activeTool: options.activeTool,
    isEditingTextboxSelection: Boolean(
      activeObject && isTextbox(activeObject) && activeObject.isEditing
    ),
    hasSelectedTextTarget: Boolean(activeObject && isTextTarget(activeObject)),
  });

  return applyEditorKeyboardAction(action, {
    canvas: options.canvas,
    activeObject,
    cancelTransientInteraction: options.cancelTransientInteraction,
    undo: options.undo,
    redo: options.redo,
    duplicateSelection: options.duplicateSelection,
    ...(options.nudgeSelection ? { nudgeSelection: options.nudgeSelection } : {}),
    deleteSelection: options.deleteSelection,
    applyCropSelection: options.applyCropSelection,
    ...(options.applyTextSelectionStyle
      ? { applyTextSelectionStyle: options.applyTextSelectionStyle }
      : {}),
    ...(options.completeDrawSession ? { completeDrawSession: options.completeDrawSession } : {}),
    syncRuntimeState: options.syncRuntimeState ?? (() => undefined),
  });
}

export function handleEditorWindowKeyUp(options: {
  code: string;
  finalizeSelectionNudge?: (code: string) => void;
}): { nextSpacePressed?: boolean } {
  options.finalizeSelectionNudge?.(options.code);
  return isEditorSpaceKey(options.code) ? { nextSpacePressed: false } : {};
}

export function resolveEditorSpaceKeyUp(code: string): boolean {
  return isEditorSpaceKey(code);
}
