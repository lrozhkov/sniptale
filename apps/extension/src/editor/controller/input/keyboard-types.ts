import type { EditorTextInlineStyleCommand } from '../text-formatting';
import type { EditorSelectionNudge } from '../tools/nudge';

export type EditorKeyboardAction =
  | 'ignore'
  | 'space-down'
  | 'undo'
  | 'redo'
  | 'duplicate-selection'
  | 'exit-text-edit'
  | 'cancel-text-edit'
  | 'cancel-transient'
  | 'delete-selection'
  | 'apply-crop'
  | 'complete-draw'
  | 'enter-text-edit'
  | { type: 'text-style'; command: EditorTextInlineStyleCommand }
  | EditorSelectionNudge;

export interface EditorKeyboardResolverOptions {
  hasCanvas: boolean;
  targetIsInteractive: boolean;
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  hasSelection: boolean;
  hasCropGuide: boolean;
  hasDrawSession?: boolean;
  isEditingTextboxSelection: boolean;
  isEditingTextboxInput: boolean;
  hasSelectedTextTarget?: boolean;
  activeTool: string;
}
