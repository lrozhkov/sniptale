import { vi } from 'vitest';

export function createHoverControllerStub() {
  const cancelDrawing = vi.fn(() => false);
  const cancelPendingHoverFrame = vi.fn();
  const clearHoverTracking = vi.fn();
  const createHoverOverlay = vi.fn();
  const createOverlayContainer = vi.fn();
  const handleClick = vi.fn();
  const handleMouseLeave = vi.fn();
  const handleMouseMove = vi.fn();
  const handlePointerDown = vi.fn();
  const handlePointerMove = vi.fn();
  const handlePointerUp = vi.fn();
  const hideHoverOverlay = vi.fn();
  const invalidateFrameCache = vi.fn();
  const invalidateSettingsCache = vi.fn();
  const removeHoverOverlay = vi.fn();
  const removeOverlayContainer = vi.fn();

  return {
    overlay: {
      createContainer: createOverlayContainer,
      removeContainer: removeOverlayContainer,
      createPreview: createHoverOverlay,
      removePreview: removeHoverOverlay,
      hidePreview: hideHoverOverlay,
    },
    invalidation: {
      frameCache: invalidateFrameCache,
      settingsCache: invalidateSettingsCache,
    },
    input: {
      mouseMove: handleMouseMove,
      mouseLeave: handleMouseLeave,
      click: handleClick,
      pointerDown: handlePointerDown,
      pointerMove: handlePointerMove,
      pointerUp: handlePointerUp,
      cancelDrawing,
    },
    tracking: {
      cancelPendingFrame: cancelPendingHoverFrame,
      clear: clearHoverTracking,
    },
    cancelDrawing,
    cancelPendingHoverFrame,
    clearHoverTracking,
    createHoverOverlay,
    createOverlayContainer,
    handleClick,
    handleMouseLeave,
    handleMouseMove,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    hideHoverOverlay,
    invalidateFrameCache,
    invalidateSettingsCache,
    removeHoverOverlay,
    removeOverlayContainer,
  };
}

export function createLoggerStub() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
  };
}
