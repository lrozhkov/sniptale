import type { ToolbarWorkingMode } from '@sniptale/runtime-contracts/messaging/message-types';
import type { UseToolbarModeControllerResult } from '../../toolbar/mode-controller/types';

export function selectToolbarWorkingMode(
  modeController: UseToolbarModeControllerResult,
  mode: ToolbarWorkingMode
): void {
  switch (mode) {
    case 'cursor':
      modeController.handleEnableCursorMode();
      return;
    case 'drawing':
      modeController.handleToggleDrawingMode?.(true);
      return;
    case 'highlighter':
      modeController.handleToggleHighlighterMode(true);
      return;
    case 'quick-edit':
      modeController.handleToggleQuickEditMode(true);
      return;
    case 'design-review':
      modeController.handleToggleDesignReviewMode(true);
      return;
    case 'video-recording':
      // The background-owned surface snapshot activates this mode after the toolbar is available.
      return;
  }
}
