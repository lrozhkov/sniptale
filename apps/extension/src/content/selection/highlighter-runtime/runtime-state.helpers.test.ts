import { describe, expect, it, vi } from 'vitest';

import { createHighlighterRuntimeState } from './state';
import { resetHighlighterHoverUi, setHighlighterTooltipVisibility } from './runtime-state.helpers';

describe('highlighter-runtime-state helpers', () => {
  it('resets hover preview UI through the shared teardown policy', () => {
    const controller = {
      cancelPendingHoverFrame: vi.fn(),
      clearHoverTracking: vi.fn(),
      hideHoverOverlay: vi.fn(),
      removeHoverOverlay: vi.fn(),
      removeOverlayContainer: vi.fn(),
    };

    resetHighlighterHoverUi(controller);

    expect(controller.cancelPendingHoverFrame).toHaveBeenCalledTimes(1);
    expect(controller.clearHoverTracking).toHaveBeenCalledTimes(1);
    expect(controller.removeHoverOverlay).toHaveBeenCalledTimes(1);
    expect(controller.removeOverlayContainer).toHaveBeenCalledTimes(1);
    expect(controller.hideHoverOverlay).not.toHaveBeenCalled();
  });

  it('hides hover preview when a frame tooltip becomes visible', () => {
    const state = createHighlighterRuntimeState();
    const controller = {
      clearHoverTracking: vi.fn(),
      hideHoverOverlay: vi.fn(),
    };

    setHighlighterTooltipVisibility(state, true, controller);

    expect(state.isTooltipVisible).toBe(true);
    expect(controller.hideHoverOverlay).toHaveBeenCalledTimes(1);
    expect(controller.clearHoverTracking).not.toHaveBeenCalled();
  });

  it('clears hover tracking when the frame tooltip is dismissed', () => {
    const state = createHighlighterRuntimeState();
    state.isTooltipVisible = true;
    const controller = {
      clearHoverTracking: vi.fn(),
      hideHoverOverlay: vi.fn(),
    };

    setHighlighterTooltipVisibility(state, false, controller);

    expect(state.isTooltipVisible).toBe(false);
    expect(controller.clearHoverTracking).toHaveBeenCalledTimes(1);
    expect(controller.hideHoverOverlay).not.toHaveBeenCalled();
  });
});
