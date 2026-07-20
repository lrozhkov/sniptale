import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setupSelectionModeEventListenersMock } = vi.hoisted(() => ({
  setupSelectionModeEventListenersMock: vi.fn(),
}));

vi.mock('.', () => ({
  setupSelectionModeEventListeners: setupSelectionModeEventListenersMock,
}));

import { setupSelectionModeRuntimeListeners } from './runtime';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selection-mode runtime listeners', () => {
  it('maps the runtime listener setup contract onto the listener owner seam', () => {
    const handleClick = vi.fn();
    const handleKeyDown = vi.fn();
    const handleMouseDown = vi.fn();
    const handleMouseLeave = vi.fn();
    const handleMouseMove = vi.fn();
    const handleMouseUp = vi.fn();
    const hideHoverFrame = vi.fn();
    const setCleanupEventListeners = vi.fn();
    const setCleanupScrollListeners = vi.fn();
    const state = { currentState: 'drag' as const };

    setupSelectionModeRuntimeListeners({
      hideHoverFrame,
      setCleanupEventListeners,
      setCleanupScrollListeners,
      setupListenerHandlers: {
        handleClick,
        handleKeyDown,
        handleMouseDown,
        handleMouseLeave,
        handleMouseMove,
        handleMouseUp,
      },
      state,
    } as never);

    expect(setupSelectionModeEventListenersMock).toHaveBeenCalledWith({
      currentState: expect.any(Function),
      handleClick,
      handleKeyDown,
      handleMouseDown,
      handleMouseLeave,
      handleMouseMove,
      handleMouseUp,
      hideHoverFrame,
      setCleanupEventListeners,
      setCleanupScrollListeners,
    });
    expect(setupSelectionModeEventListenersMock.mock.calls[0]?.[0].currentState()).toBe('drag');
  });
});
