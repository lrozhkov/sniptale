import type { Canvas, FabricObject } from 'fabric';
import type { EditorSelectionNudge } from '../../tools/nudge';
import type { EditorTextInlineStyleCommand } from '../../text-formatting';
import type { resolveEditorKeyboardAction } from '../keyboard';

export type EditorKeyboardAction = ReturnType<typeof resolveEditorKeyboardAction>;
export type EditorTextStyleKeyboardAction = Extract<EditorKeyboardAction, { type: 'text-style' }>;

export type EditorKeyboardCommandCallbacks = {
  cancelTransientInteraction: () => boolean;
  undo: () => void;
  redo: () => void;
  duplicateSelection: () => void;
  nudgeSelection?: (nudge: EditorSelectionNudge) => boolean;
  deleteSelection: () => void;
  applyCropSelection: () => void;
  applyTextSelectionStyle?: (command: EditorTextInlineStyleCommand) => boolean;
  completeDrawSession?: () => boolean;
  syncRuntimeState?: () => void;
};

export type EditorKeyboardActionOptions = EditorKeyboardCommandCallbacks & {
  canvas: Canvas | null;
  activeObject: FabricObject | undefined;
};
