import type { HighlighterRuntimeState } from './state';

interface HighlighterHoverUiController {
  cancelPendingHoverFrame(): void;
  clearHoverTracking(): void;
  hideHoverOverlay(): void;
  removeHoverOverlay(): void;
  removeOverlayContainer(): void;
}

/**
 * Clears any active hover-preview UI so public API cleanup and runtime disable share the same
 * teardown policy.
 */
export function resetHighlighterHoverUi(controller: HighlighterHoverUiController): void {
  controller.cancelPendingHoverFrame();
  controller.clearHoverTracking();
  controller.removeHoverOverlay();
  controller.removeOverlayContainer();
}

/**
 * Applies frame-tooltip visibility and performs the matching hover-preview side effect.
 */
export function setHighlighterTooltipVisibility(
  state: HighlighterRuntimeState,
  isVisible: boolean,
  controller: Pick<HighlighterHoverUiController, 'clearHoverTracking' | 'hideHoverOverlay'>
): void {
  state.isTooltipVisible = isVisible;

  if (isVisible) {
    controller.hideHoverOverlay();
    return;
  }

  controller.clearHoverTracking();
}
