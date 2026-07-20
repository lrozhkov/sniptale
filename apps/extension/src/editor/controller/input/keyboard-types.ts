import type { EditorTextInlineStyleCommand } from '../text-formatting';
import type { EditorSelectionNudge } from '../tools/nudge';

export type EditorKeyboardAction =
  | 'ignore'
  | 'space-down'
  | 'undo'
  | 'redo'
  | 'copy-raster-selection'
  | 'cut-raster-selection'
  | 'paste-raster-clipboard'
  | 'duplicate-selection'
  | 'exit-text-edit'
  | 'cancel-transient'
  | 'delete-raster-selection'
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
  hasSelection: boolean;
  hasCropGuide: boolean;
  hasDrawSession?: boolean;
  isEditingTextboxSelection: boolean;
  hasSelectedTextTarget?: boolean;
  activeTool: string;
  hasRasterSelection: boolean;
}
