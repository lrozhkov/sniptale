import { vi } from 'vitest';

export function createHoverControllerStub() {
  const handleDragStart = vi.fn();
  const cancelDrawing = vi.fn(() => false);
  const cancelPendingHoverFrame = vi.fn();
  const clearHoverTracking = vi.fn();
  const createHoverOverlay = vi.fn();
  const createOverlayContainer = vi.fn();
  const consumeSuppressedClick = vi.fn(() => false);
  const handleClick = vi.fn();
  const handleMouseLeave = vi.fn();
  const handleMouseDown = vi.fn();
  const handleMouseMove = vi.fn();
  const handlePointerDown = vi.fn();
  const handlePointerMove = vi.fn();
  const handlePointerUp = vi.fn();
  const hideHoverOverlay = vi.fn();
  const hasHoverTarget = vi.fn(() => false);
  const invalidateFrameCache = vi.fn();
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
    },
    input: {
      dragStart: handleDragStart,
      mouseDown: handleMouseDown,
      mouseMove: handleMouseMove,
      mouseLeave: handleMouseLeave,
      click: handleClick,
      pointerDown: handlePointerDown,
      pointerMove: handlePointerMove,
      pointerUp: handlePointerUp,
      cancelDrawing,
      consumeSuppressedClick,
    },
    tracking: {
      cancelPendingFrame: cancelPendingHoverFrame,
      clear: clearHoverTracking,
      hasTarget: hasHoverTarget,
    },
    cancelDrawing,
    cancelPendingHoverFrame,
    clearHoverTracking,
    consumeSuppressedClick,
    createHoverOverlay,
    createOverlayContainer,
    handleDragStart,
    handleClick,
    handleMouseLeave,
    handleMouseDown,
    handleMouseMove,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    hideHoverOverlay,
    hasHoverTarget,
    invalidateFrameCache,
    removeHoverOverlay,
    removeOverlayContainer,
  };
}

export function createLoggerStub() {
  return {
    debug: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}
