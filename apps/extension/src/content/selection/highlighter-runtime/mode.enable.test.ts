import { beforeEach, describe, expect, it, vi } from 'vitest';

const enableMocks = vi.hoisted(() => ({
  applyHighlighterDocumentModeMock: vi.fn(),
  deactivateOtherContentModesMock: vi.fn(),
  dispatchHighlighterModeChangedMock: vi.fn(),
  mountHighlighterCursorStyleMock: vi.fn(),
  registerHighlighterRuntimeListenersMock: vi.fn(),
  setContentModeEnabledMock: vi.fn(),
}));

vi.mock('../../application/mode-session', () => ({
  deactivateOtherContentModes: enableMocks.deactivateOtherContentModesMock,
  setContentModeEnabled: enableMocks.setContentModeEnabledMock,
}));

vi.mock('./runtime-document-mode', () => ({
  applyHighlighterDocumentMode: enableMocks.applyHighlighterDocumentModeMock,
}));

vi.mock('./runtime-cursor-style', () => ({
  mountHighlighterCursorStyle: enableMocks.mountHighlighterCursorStyleMock,
  removeHighlighterCursorStyle: vi.fn(),
}));

vi.mock('./runtime-listeners', () => ({
  createHighlighterRuntimeEscapeKeyHandler: vi.fn(),
  registerHighlighterRuntimeListeners: enableMocks.registerHighlighterRuntimeListenersMock,
}));

vi.mock('../../platform/page-context/mode-events', async (importOriginal) => ({
  ...(await importOriginal()),
  dispatchHighlighterModeChanged: enableMocks.dispatchHighlighterModeChangedMock,
}));

import { enableHighlighterRuntime } from './mode';
import { createHoverControllerStub } from './controller.test-support';
import { createHighlighterRuntimeState } from './state';

beforeEach(() => {
  vi.clearAllMocks();
});

function createDisabledState() {
  return createHighlighterRuntimeState();
}

function bootstrapEnabledRuntime() {
  const cleanupRuntimeListeners = vi.fn();
  const hoverController = createHoverControllerStub();
  const state = createDisabledState();

  enableMocks.registerHighlighterRuntimeListenersMock.mockReturnValue(cleanupRuntimeListeners);

  enableHighlighterRuntime(state, hoverController);

  return {
    cleanupRuntimeListeners,
    hoverController,
    state,
  };
}

describe('highlighter mode enable bootstrap', () => {
  it('boots the runtime and composes cleanup ownership', () => {
    const { hoverController } = bootstrapEnabledRuntime();

    expect(enableMocks.deactivateOtherContentModesMock).toHaveBeenCalledWith('highlighter');
    expect(enableMocks.setContentModeEnabledMock).toHaveBeenCalledWith('highlighter', true);
    expect(enableMocks.dispatchHighlighterModeChangedMock).toHaveBeenCalledWith({ enabled: true });
    expect(hoverController.createOverlayContainer).toHaveBeenCalledTimes(1);
    expect(hoverController.createHoverOverlay).toHaveBeenCalledTimes(1);
    expect(enableMocks.applyHighlighterDocumentModeMock).toHaveBeenCalledWith(true);
    expect(enableMocks.mountHighlighterCursorStyleMock).toHaveBeenCalledTimes(1);
    expect(enableMocks.registerHighlighterRuntimeListenersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disableHighlighterMode: expect.any(Function),
        hasActivePopover: expect.any(Function),
        hoverController,
        isAnyFrameEditing: expect.any(Function),
      })
    );
  });

  it('runs the runtime cleanup handler when cleanup is invoked', () => {
    const { cleanupRuntimeListeners, state } = bootstrapEnabledRuntime();

    state.cleanupEventListeners?.();

    expect(cleanupRuntimeListeners).toHaveBeenCalledTimes(1);
  });
});

describe('highlighter mode enable guards', () => {
  it('does nothing when the runtime is already enabled', () => {
    const hoverController = createHoverControllerStub();
    const state = createDisabledState();
    state.isModeEnabled = true;

    enableHighlighterRuntime(state, hoverController);

    expect(enableMocks.deactivateOtherContentModesMock).not.toHaveBeenCalled();
    expect(enableMocks.registerHighlighterRuntimeListenersMock).not.toHaveBeenCalled();
  });
});
