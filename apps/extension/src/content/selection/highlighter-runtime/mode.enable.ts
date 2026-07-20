import { deactivateOtherContentModes, setContentModeEnabled } from '../../application/mode-session';
import { addHighlighterSettingsChangedListener } from '../../platform/page-context/frame-events';
import {
  applyHighlighterDocumentMode,
  dispatchHighlighterModeChanged,
  mountHighlighterCursorStyle,
  registerHighlighterRuntimeListeners,
} from './runtime.helpers';
import { disableHighlighterRuntime } from './mode.disable';
import type { createHighlighterHoverController } from '../highlighter-hover-preview';
import type { createHighlighterRuntimeState } from './state';

type HighlighterState = ReturnType<typeof createHighlighterRuntimeState>;
type HoverController = ReturnType<typeof createHighlighterHoverController>;

export function enableHighlighterRuntime(
  state: HighlighterState,
  hoverController: HoverController
): void {
  if (state.isModeEnabled) {
    return;
  }

  deactivateOtherContentModes('highlighter');
  state.isModeEnabled = true;
  setContentModeEnabled('highlighter', true);
  dispatchHighlighterModeChanged(true);

  hoverController.createOverlayContainer();
  hoverController.createHoverOverlay();
  applyHighlighterDocumentMode(true);
  mountHighlighterCursorStyle();
  state.cleanupEventListeners = registerHighlighterRuntimeListeners({
    disableHighlighterMode: () => disableHighlighterRuntime(state, hoverController),
    hoverController,
    isAnyFrameEditing: () => state.isFrameEditing,
  });

  const handleSettingsChanged = (
    detail: Parameters<typeof addHighlighterSettingsChangedListener>[0] extends (
      payload: infer T
    ) => void
      ? T
      : never
  ) => {
    hoverController.invalidateSettingsCache(detail);
  };
  const cleanupHighlighterSettingsChanged =
    addHighlighterSettingsChangedListener(handleSettingsChanged);

  const originalCleanup = state.cleanupEventListeners;
  state.cleanupEventListeners = () => {
    originalCleanup();
    cleanupHighlighterSettingsChanged();
  };
}
