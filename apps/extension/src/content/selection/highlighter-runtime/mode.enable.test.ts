import { beforeEach, describe, expect, it, vi } from 'vitest';

const enableMocks = vi.hoisted(() => ({
  addHighlighterSettingsChangedListenerMock: vi.fn(),
  applyHighlighterDocumentModeMock: vi.fn(),
  deactivateOtherContentModesMock: vi.fn(),
  dispatchHighlighterModeChangedMock: vi.fn(),
  mountHighlighterCursorStyleMock: vi.fn(),
  registerHighlighterRuntimeListenersMock: vi.fn(),
  setContentModeEnabledMock: vi.fn(),
}));

let settingsChangedHandler: ((detail?: { defaultBorderPresetId?: string }) => void) | null = null;

vi.mock('../../application/mode-session', () => ({
  deactivateOtherContentModes: enableMocks.deactivateOtherContentModesMock,
  setContentModeEnabled: enableMocks.setContentModeEnabledMock,
}));

vi.mock('../../platform/page-context/frame-events', async (importOriginal) => ({
  ...(await importOriginal()),
  addHighlighterSettingsChangedListener: (
    handler: (detail?: { defaultBorderPresetId?: string }) => void
  ) => {
    settingsChangedHandler = handler;
    return enableMocks.addHighlighterSettingsChangedListenerMock();
  },
}));

vi.mock('./runtime.helpers', () => ({
  applyHighlighterDocumentMode: enableMocks.applyHighlighterDocumentModeMock,
  dispatchHighlighterModeChanged: enableMocks.dispatchHighlighterModeChangedMock,
  mountHighlighterCursorStyle: enableMocks.mountHighlighterCursorStyleMock,
  registerHighlighterRuntimeListeners: enableMocks.registerHighlighterRuntimeListenersMock,
}));

vi.mock('./mode.disable', () => ({
  disableHighlighterRuntime: vi.fn(),
}));

import { createHoverControllerStub } from './controller.test.helpers';
import { enableHighlighterRuntime } from './mode.enable';

beforeEach(() => {
  vi.clearAllMocks();
  settingsChangedHandler = null;
});

function createDisabledState() {
  return {
    cleanupEventListeners: null as (() => void) | null,
    isFrameEditing: false,
    isModeEnabled: false,
    isPaused: false,
    isTooltipVisible: false,
  };
}

function bootstrapEnabledRuntime() {
  const cleanupRuntimeListeners = vi.fn();
  const cleanupSettingsChanged = vi.fn();
  const hoverController = createHoverControllerStub();
  const state = createDisabledState();

  enableMocks.registerHighlighterRuntimeListenersMock.mockReturnValue(cleanupRuntimeListeners);
  enableMocks.addHighlighterSettingsChangedListenerMock.mockReturnValue(cleanupSettingsChanged);

  enableHighlighterRuntime(state as never, hoverController as never);

  return {
    cleanupRuntimeListeners,
    cleanupSettingsChanged,
    hoverController,
    state,
  };
}

describe('highlighter mode enable bootstrap', () => {
  it('boots the runtime and composes cleanup ownership', () => {
    const { hoverController } = bootstrapEnabledRuntime();

    expect(enableMocks.deactivateOtherContentModesMock).toHaveBeenCalledWith('highlighter');
    expect(enableMocks.setContentModeEnabledMock).toHaveBeenCalledWith('highlighter', true);
    expect(enableMocks.dispatchHighlighterModeChangedMock).toHaveBeenCalledWith(true);
    expect(hoverController.createOverlayContainer).toHaveBeenCalledTimes(1);
    expect(hoverController.createHoverOverlay).toHaveBeenCalledTimes(1);
    expect(enableMocks.applyHighlighterDocumentModeMock).toHaveBeenCalledWith(true);
    expect(enableMocks.mountHighlighterCursorStyleMock).toHaveBeenCalledTimes(1);
    expect(enableMocks.registerHighlighterRuntimeListenersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disableHighlighterMode: expect.any(Function),
        hoverController,
        isAnyFrameEditing: expect.any(Function),
      })
    );
  });

  it('runs both cleanup handlers when the composed cleanup is invoked', () => {
    const { cleanupRuntimeListeners, cleanupSettingsChanged, state } = bootstrapEnabledRuntime();

    state.cleanupEventListeners?.();

    expect(cleanupRuntimeListeners).toHaveBeenCalledTimes(1);
    expect(cleanupSettingsChanged).toHaveBeenCalledTimes(1);
  });
});

describe('highlighter mode enable guards', () => {
  it('invalidates hover settings through the shared listener seam', () => {
    const hoverController = createHoverControllerStub();
    const state = createDisabledState();

    enableMocks.registerHighlighterRuntimeListenersMock.mockReturnValue(vi.fn());
    enableMocks.addHighlighterSettingsChangedListenerMock.mockReturnValue(vi.fn());

    enableHighlighterRuntime(state as never, hoverController as never);
    settingsChangedHandler?.({ defaultBorderPresetId: 'preset-2' });

    expect(hoverController.invalidateSettingsCache).toHaveBeenCalledWith({
      defaultBorderPresetId: 'preset-2',
    });
  });

  it('does nothing when the runtime is already enabled', () => {
    const hoverController = createHoverControllerStub();
    const state = {
      cleanupEventListeners: null as (() => void) | null,
      isFrameEditing: false,
      isModeEnabled: true,
      isPaused: false,
      isTooltipVisible: false,
    };

    enableHighlighterRuntime(state as never, hoverController as never);

    expect(enableMocks.deactivateOtherContentModesMock).not.toHaveBeenCalled();
    expect(enableMocks.registerHighlighterRuntimeListenersMock).not.toHaveBeenCalled();
  });
});
