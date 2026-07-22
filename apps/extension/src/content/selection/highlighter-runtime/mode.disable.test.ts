import { beforeEach, describe, expect, it, vi } from 'vitest';

const disableMocks = vi.hoisted(() => ({
  applyHighlighterDocumentModeMock: vi.fn(),
  forceHideTooltipMock: vi.fn(),
  removeHighlighterCursorStyleMock: vi.fn(),
  setContentModeEnabledMock: vi.fn(),
  dispatchHighlighterModeChangedMock: vi.fn(),
}));

vi.mock('../../application/mode-session', () => ({
  setContentModeEnabled: disableMocks.setContentModeEnabledMock,
}));

vi.mock('./runtime-document-mode', () => ({
  applyHighlighterDocumentMode: disableMocks.applyHighlighterDocumentModeMock,
}));

vi.mock('./runtime-cursor-style', () => ({
  mountHighlighterCursorStyle: vi.fn(),
  removeHighlighterCursorStyle: disableMocks.removeHighlighterCursorStyleMock,
}));

vi.mock('../../platform/page-context/mode-events', async (importOriginal) => ({
  ...(await importOriginal()),
  dispatchHighlighterModeChanged: disableMocks.dispatchHighlighterModeChangedMock,
}));

vi.mock('../frame-runtime/state/frame-ui.store', () => ({
  useFrameUIStore: {
    getState: () => ({ forceHideTooltip: disableMocks.forceHideTooltipMock }),
  },
}));

import { disableHighlighterRuntime } from './mode';
import { createHoverControllerStub } from './controller.test-support';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('highlighter mode disable lifecycle', () => {
  it('resets runtime-owned state and cleanup when disabling the mode', () => {
    const cleanupEventListeners = vi.fn();
    const state = {
      cleanupEventListeners,
      isFrameEditing: true,
      isModeEnabled: true,
      isPaused: true,
      isTooltipVisible: true,
    };
    const hoverController = createHoverControllerStub();

    disableHighlighterRuntime(state as never, hoverController as never);

    expect(state.isModeEnabled).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.isFrameEditing).toBe(false);
    expect(state.isTooltipVisible).toBe(false);
    expect(state.cleanupEventListeners).toBeNull();
    expect(disableMocks.setContentModeEnabledMock).toHaveBeenCalledWith('highlighter', false);
    expect(disableMocks.forceHideTooltipMock).toHaveBeenCalledTimes(1);
    expect(hoverController.cancelPendingHoverFrame).toHaveBeenCalledTimes(2);
    expect(hoverController.clearHoverTracking).toHaveBeenCalledTimes(2);
    expect(cleanupEventListeners).toHaveBeenCalledTimes(1);
    expect(disableMocks.dispatchHighlighterModeChangedMock).toHaveBeenCalledWith({
      enabled: false,
    });
    expect(hoverController.removeHoverOverlay).toHaveBeenCalledTimes(1);
    expect(hoverController.removeOverlayContainer).toHaveBeenCalledTimes(1);
    expect(disableMocks.applyHighlighterDocumentModeMock).toHaveBeenCalledWith(false);
    expect(disableMocks.removeHighlighterCursorStyleMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disable is requested for an already disabled runtime', () => {
    disableHighlighterRuntime(
      {
        cleanupEventListeners: null,
        isFrameEditing: false,
        isModeEnabled: false,
        isPaused: false,
        isTooltipVisible: false,
      } as never,
      createHoverControllerStub() as never
    );

    expect(disableMocks.setContentModeEnabledMock).not.toHaveBeenCalledWith('highlighter', false);
    expect(disableMocks.removeHighlighterCursorStyleMock).not.toHaveBeenCalled();
  });
});
