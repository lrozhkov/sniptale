import { beforeEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  createListenerProps: vi.fn(),
  createListenerRegistration: vi.fn(),
  createModeHandlers: vi.fn(),
  createModeHelpers: vi.fn(),
}));

vi.mock('./controller.helpers', () => ({
  createQuickEditModeHandlers: controllerMocks.createModeHandlers,
  createQuickEditModeHelpers: controllerMocks.createModeHelpers,
  createQuickEditModeListenerProps: controllerMocks.createListenerProps,
  createQuickEditModeListenerRegistration: controllerMocks.createListenerRegistration,
}));

import { createQuickEditModeToggles } from './controller';
import { createQuickEditOverlayState } from './helpers';

beforeEach(() => {
  controllerMocks.createListenerProps.mockReset();
  controllerMocks.createListenerRegistration.mockReset();
  controllerMocks.createModeHandlers.mockReset();
  controllerMocks.createModeHelpers.mockReset();
  controllerMocks.createModeHelpers.mockReturnValue({
    disableHelpers: {
      cleanupModeResources: vi.fn(),
      disableEditingSessions: vi.fn(),
    },
    modeGuards: {
      startDisableFlow: vi.fn(),
      startEnableFlow: vi.fn(),
    },
  });
  controllerMocks.createListenerProps.mockReturnValue({ listenerProps: true });
  controllerMocks.createListenerRegistration.mockReturnValue(vi.fn(() => 1));
  controllerMocks.createModeHandlers.mockReturnValue({
    disable: vi.fn(),
    enable: vi.fn(),
  });
});

describe('quick-edit-runtime controller', () => {
  it('builds mode toggles from helper families and returns their handlers', () => {
    const toggles = createQuickEditModeToggles({
      disableDocumentMode: vi.fn(),
      editingElements: new Map(),
      finishEditing: vi.fn(),
      getCleanupEventListeners: vi.fn(),
      getIsQuickEditMode: vi.fn(),
      handleBlur: vi.fn(),
      handleClick: vi.fn(),
      handleKeyDown: vi.fn(),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
      handleOutsideClick: vi.fn(),
      overlayActions: {
        createBlockingOverlay: vi.fn(),
        createHoverOverlay: vi.fn(),
        disconnectResizeObserver: vi.fn(),
        hideHoverOverlay: vi.fn(),
        removeBlockingOverlay: vi.fn(),
        removeHoverOverlay: vi.fn(),
      },
      overlayState: createQuickEditOverlayState(),
      setCleanupEventListeners: vi.fn(),
      setIsQuickEditMode: vi.fn(),
    });

    expect(controllerMocks.createModeHelpers).toHaveBeenCalledOnce();
    expect(controllerMocks.createListenerProps).toHaveBeenCalledOnce();
    expect(controllerMocks.createListenerRegistration).toHaveBeenCalledWith({
      listenerProps: true,
    });
    expect(controllerMocks.createModeHandlers).toHaveBeenCalledOnce();
    expect(toggles).toEqual(
      expect.objectContaining({
        disable: expect.any(Function),
        enable: expect.any(Function),
      })
    );
  });
});
