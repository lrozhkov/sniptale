import { vi } from 'vitest';

export function createHoverControllerStub() {
  return {
    cancelPendingHoverFrame: vi.fn(),
    clearHoverTracking: vi.fn(),
    createHoverOverlay: vi.fn(),
    createOverlayContainer: vi.fn(),
    handleClick: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    hideHoverOverlay: vi.fn(),
    invalidateFrameCache: vi.fn(),
    invalidateSettingsCache: vi.fn(),
    removeHoverOverlay: vi.fn(),
    removeOverlayContainer: vi.fn(),
  };
}

export function createLoggerStub() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
  };
}
