import { deactivateOtherContentModes, setContentModeEnabled } from '../../application/mode-session';
import { addHighlighterSettingsChangedListener } from '../../platform/page-context/frame-events';
import { dispatchHighlighterModeChanged as emitHighlighterModeChanged } from '../../platform/page-context/mode-events';
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
  const cleanupSettingsChanged = addHighlighterSettingsChangedListener((detail) => {
    hoverController.invalidation.settingsCache(detail);
  });

  state.cleanupEventListeners = () => {
    cleanupRuntimeListeners();
    cleanupSettingsChanged();
  };
}

export function disableHighlighterRuntime(
  state: HighlighterRuntimeState,
  hoverController: HoverController
): void {
  if (!state.isModeEnabled) {
    return;
  }

  state.isModeEnabled = false;
  state.isPaused = false;
  state.isFrameEditing = false;
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
