import type { Canvas } from 'fabric';
import { isInteractiveShortcutTarget, isTextbox } from '../core/helpers';
import { isEditableObject } from '../../document/model';
import { isTextTarget } from '../events/text-target';
import { resolveEditorKeyboardAction } from './keyboard';
import { applyEditorKeyboardAction } from './keyboard-action-runner/dispatch';
import type { EditorKeyboardCommandCallbacks } from './keyboard-action-runner/types';

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
  hasRasterSelection: boolean;
  hasCropGuide: boolean;
  hasDrawSession?: boolean;
};

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
    hasRasterSelection: options.hasRasterSelection,
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
    copyRasterSelection: options.copyRasterSelection,
    cutRasterSelection: options.cutRasterSelection,
    pasteRasterClipboard: options.pasteRasterClipboard,
    ...(options.nudgeSelection ? { nudgeSelection: options.nudgeSelection } : {}),
    deleteRasterSelectionPixels: options.deleteRasterSelectionPixels,
    deleteSelection: options.deleteSelection,
    applyCropSelection: options.applyCropSelection,
    ...(options.applyTextSelectionStyle
      ? { applyTextSelectionStyle: options.applyTextSelectionStyle }
      : {}),
    ...(options.completeDrawSession ? { completeDrawSession: options.completeDrawSession } : {}),
    syncRuntimeState: options.syncRuntimeState ?? (() => undefined),
  });
}
