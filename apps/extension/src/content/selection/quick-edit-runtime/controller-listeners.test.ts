import { beforeEach, describe, expect, it, vi } from 'vitest';

const listenerMocks = vi.hoisted(() => ({
  enableCursor: vi.fn(),
  registerListeners: vi.fn(),
}));

vi.mock('./helpers', async () => {
  const actual = await vi.importActual<typeof import('./helpers')>('./helpers');

  return {
    ...actual,
    enableQuickEditCursor: listenerMocks.enableCursor,
  };
});

vi.mock('./listeners', () => ({
  registerQuickEditModeListeners: listenerMocks.registerListeners,
}));

import {
  createQuickEditModeListenerProps,
  createQuickEditModeListenerRegistration,
} from './controller-listeners';
import { createQuickEditOverlayState } from './helpers';

function resetListenerMocks(): void {
  listenerMocks.enableCursor.mockReset();
  listenerMocks.registerListeners.mockReset();
  listenerMocks.registerListeners.mockReturnValue({ cleanup: vi.fn(), iframeCount: 3 });
}

beforeEach(() => {
  resetListenerMocks();
});

describe('quick-edit-runtime listener props', () => {
  it('maps controller props into listener registration props', () => {
    const overlayActions = {
      createBlockingOverlay: vi.fn(),
      createHoverOverlay: vi.fn(),
      hideHoverOverlay: vi.fn(),
    };

    const props = createQuickEditModeListenerProps({
      handleBlur: vi.fn(),
      handleClick: vi.fn(),
      handleKeyDown: vi.fn(),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
      handleOutsideClick: vi.fn(),
      overlayActions,
      overlayState: createQuickEditOverlayState(),
      setCleanupEventListeners: vi.fn(),
    });

    expect(props.createBlockingOverlay).toBe(overlayActions.createBlockingOverlay);
    expect(props.hideHoverOverlay).toBe(overlayActions.hideHoverOverlay);
  });
});

describe('quick-edit-runtime listener registration', () => {
  it('arms overlays, listener cleanup, and cursor state when enabling the mode', () => {
    const createBlockingOverlay = vi.fn();
    const createHoverOverlay = vi.fn();
    const setCleanupEventListeners = vi.fn();
    const cleanup = vi.fn();
    listenerMocks.registerListeners.mockReturnValue({ cleanup, iframeCount: 2 });

    const enable = createQuickEditModeListenerRegistration({
      createBlockingOverlay,
      createHoverOverlay,
      handleBlur: vi.fn(),
      handleClick: vi.fn(),
      handleKeyDown: vi.fn(),
      handleMouseLeave: vi.fn(),
      handleMouseMove: vi.fn(),
      handleOutsideClick: vi.fn(),
      hideHoverOverlay: vi.fn(),
      overlayState: createQuickEditOverlayState(),
      setCleanupEventListeners,
    });

    expect(enable()).toBe(2);
    expect(createHoverOverlay).toHaveBeenCalledOnce();
    expect(createBlockingOverlay).toHaveBeenCalledOnce();
    expect(setCleanupEventListeners).toHaveBeenCalledWith(cleanup);
    expect(listenerMocks.enableCursor).toHaveBeenCalledOnce();
  });
});
