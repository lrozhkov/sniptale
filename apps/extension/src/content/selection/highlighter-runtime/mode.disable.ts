import { setContentModeEnabled } from '../../application/mode-session';
import {
  applyHighlighterDocumentMode,
  dispatchHighlighterModeChanged,
  removeHighlighterCursorStyle,
} from './runtime.helpers';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';
import { resetHighlighterHoverUi } from './runtime-state.helpers';
import type { createHighlighterHoverController } from '../highlighter-hover-preview';
import type { createHighlighterRuntimeState } from './state';

type HighlighterState = ReturnType<typeof createHighlighterRuntimeState>;
type HoverController = ReturnType<typeof createHighlighterHoverController>;

export function disableHighlighterRuntime(
  state: HighlighterState,
  hoverController: HoverController
): void {
  if (!state.isModeEnabled) {
    return;
  }

  state.isModeEnabled = false;
  state.isPaused = false;
  state.isFrameEditing = false;
  state.isTooltipVisible = false;
  setContentModeEnabled('highlighter', false);
  useFrameUIStore.getState().forceHideTooltip();
  hoverController.cancelPendingHoverFrame();
  hoverController.clearHoverTracking();
  dispatchHighlighterModeChanged(false);

  if (state.cleanupEventListeners) {
    state.cleanupEventListeners();
    state.cleanupEventListeners = null;
  }

  resetHighlighterHoverUi(hoverController);
  applyHighlighterDocumentMode(false);
  removeHighlighterCursorStyle();
}
