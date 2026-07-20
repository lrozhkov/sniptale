// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const iframeListenerMocks = vi.hoisted(() => {
  const registrations: Array<{
    event: string;
    handler: EventListener;
  }> = [];
  const cleanupFns: ReturnType<typeof vi.fn>[] = [];

  return {
    addEventListenerToAllWindowsDynamicMock: vi.fn((event: string, handler: EventListener) => {
      registrations.push({ event, handler });
      const cleanup = vi.fn();
      cleanupFns.push(cleanup);
      return cleanup;
    }),
    addScrollListenersToAllWindowsMock: vi.fn(() => {
      const cleanup = vi.fn();
      cleanupFns.push(cleanup);
      return cleanup;
    }),
    cleanupFns,
    registrations,
  };
});

const escapeKeyMocks = vi.hoisted(() => ({
  createHighlighterRuntimeEscapeKeyHandlerMock: vi.fn(() => vi.fn()),
}));

vi.mock('../../platform/frame', () => ({
  addEventListenerToAllWindowsDynamic: iframeListenerMocks.addEventListenerToAllWindowsDynamicMock,
  addScrollListenersToAllWindows: iframeListenerMocks.addScrollListenersToAllWindowsMock,
}));

vi.mock('./runtime-escape-key', () => ({
  createHighlighterRuntimeEscapeKeyHandler:
    escapeKeyMocks.createHighlighterRuntimeEscapeKeyHandlerMock,
}));

import { registerHighlighterRuntimeListeners } from './runtime-listeners';

function createHoverControllerStub() {
  return {
    handleClick: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    hideHoverOverlay: vi.fn(),
  };
}

beforeEach(() => {
  iframeListenerMocks.cleanupFns.length = 0;
  iframeListenerMocks.registrations.length = 0;
  iframeListenerMocks.addEventListenerToAllWindowsDynamicMock.mockClear();
  iframeListenerMocks.addScrollListenersToAllWindowsMock.mockClear();
  escapeKeyMocks.createHighlighterRuntimeEscapeKeyHandlerMock.mockClear();
});

describe('registerHighlighterRuntimeListeners', () => {
  it('registers hover and escape listeners and tears them down together', () => {
    const hoverController = createHoverControllerStub();
    const disableHighlighterMode = vi.fn();
    const cleanup = registerHighlighterRuntimeListeners({
      disableHighlighterMode,
      hoverController: hoverController as never,
      isAnyFrameEditing: () => false,
    });

    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'mousemove',
      hoverController.handleMouseMove,
      { capture: true }
    );
    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'mouseleave',
      expect.any(Function),
      { capture: true }
    );
    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'click',
      hoverController.handleClick,
      { capture: true }
    );
    expect(iframeListenerMocks.addScrollListenersToAllWindowsMock).toHaveBeenCalledTimes(1);
    expect(escapeKeyMocks.createHighlighterRuntimeEscapeKeyHandlerMock).toHaveBeenCalledWith({
      disableHighlighterMode,
      hoverController,
      isAnyFrameEditing: expect.any(Function),
    });

    cleanup();

    expect(iframeListenerMocks.cleanupFns).toHaveLength(5);
    expect(iframeListenerMocks.cleanupFns.every((fn) => fn.mock.calls.length === 1)).toBe(true);
  });
});
