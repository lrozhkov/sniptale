import type { EditorSelectionNudge } from '../../tools/nudge';
import type { EditorTextInlineStyleCommand } from '../../text-formatting';

export interface EditorControllerInstanceSelectionActions {
  clearSelection(): void;
  applyActiveSettingsToSelection(): void;
  applyTextSelectionStyle(command: EditorTextInlineStyleCommand): boolean;
  deleteSelection(): void;
  duplicateSelection(): Promise<void>;
  nudgeSelection(nudge: EditorSelectionNudge): boolean;
  finalizeSelectionNudge(code?: string): void;
  bringForwardSelection(): void;
  sendBackwardSelection(): void;
  bringSelectionToFront(): void;
  sendSelectionToBack(): void;
  selectLayer(
    id: string,
    options?: { additive?: boolean; focusViewport?: boolean; range?: boolean; toggle?: boolean }
  ): void;
}
