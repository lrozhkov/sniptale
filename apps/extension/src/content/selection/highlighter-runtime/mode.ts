import { deactivateOtherContentModes, setContentModeEnabled } from '../../application/mode-session';
import {
  dispatchFrameEditingChanged,
  dispatchHighlighterModeChanged as emitHighlighterModeChanged,
} from '../../platform/page-context/mode-events';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';
import type { HoverController } from '../highlighter-hover-preview';
import { mountHighlighterCursorStyle, removeHighlighterCursorStyle } from './runtime-cursor-style';
import { applyHighlighterDocumentMode } from './runtime-document-mode';
import { registerHighlighterRuntimeListeners } from './runtime-listeners';
import { resetHighlighterHoverUi, type HighlighterRuntimeState } from './state';

function dispatchHighlighterModeChanged(enabled: boolean) {
  emitHighlighterModeChanged({ enabled });
}

export function enableHighlighterRuntime(
  state: HighlighterRuntimeState,
  hoverController: HoverController
): void {
  if (state.isModeEnabled) {
    return;
  }

  deactivateOtherContentModes('highlighter');
  state.isModeEnabled = true;
  state.isCreationEnabled = true;
  setContentModeEnabled('highlighter', true);
  dispatchHighlighterModeChanged(true);

  hoverController.overlay.createContainer();
  hoverController.overlay.createPreview();
  applyHighlighterDocumentMode(true);
  mountHighlighterCursorStyle();
  const cleanupRuntimeListeners = registerHighlighterRuntimeListeners({
    disableHighlighterMode: () => disableHighlighterRuntime(state, hoverController),
    hasActivePopover: () => useFrameUIStore.getState().activePopover !== null,
    hoverController,
    isAnyFrameEditing: () => state.isFrameEditing,
  });
  state.cleanupEventListeners = cleanupRuntimeListeners;
}

export function disableHighlighterRuntime(
  state: HighlighterRuntimeState,
  hoverController: HoverController
): void {
  if (!state.isModeEnabled) {
    return;
  }

  state.isModeEnabled = false;
  state.isCreationEnabled = true;
  state.isPaused = false;
  if (state.isFrameEditing) {
    state.isFrameEditing = false;
    dispatchFrameEditingChanged({ active: false });
  }
  setContentModeEnabled('highlighter', false);
  useFrameUIStore.getState().dismissFrameUi();
  hoverController.tracking.cancelPendingFrame();
  hoverController.tracking.clear();
  dispatchHighlighterModeChanged(false);

  state.cleanupEventListeners?.();
  state.cleanupEventListeners = null;

  resetHighlighterHoverUi(hoverController);
  applyHighlighterDocumentMode(false);
  removeHighlighterCursorStyle();
}
