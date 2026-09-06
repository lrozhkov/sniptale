// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const iframeListenerMocks = vi.hoisted(() => {
  const registrations: Array<{
    event: string;
    handler: EventListener;
  }> = [];
  const cleanupFns: ReturnType<typeof vi.fn>[] = [];
  const scrollHandlers: Array<() => void> = [];

  return {
    addEventListenerToAllWindowsDynamicMock: vi.fn((event: string, handler: EventListener) => {
      registrations.push({ event, handler });
      const cleanup = vi.fn();
      cleanupFns.push(cleanup);
      return cleanup;
    }),
    addWindowEventListenerToAllWindowsDynamicMock: vi.fn(
      (event: string, handler: EventListener) => {
        registrations.push({ event, handler });
        const cleanup = vi.fn();
        cleanupFns.push(cleanup);
        return cleanup;
      }
    ),
    addScrollListenersToAllWindowsMock: vi.fn((handler: () => void) => {
      scrollHandlers.push(handler);
      const cleanup = vi.fn();
      cleanupFns.push(cleanup);
      return cleanup;
    }),
    cleanupFns,
    registrations,
    scrollHandlers,
  };
});

vi.mock('../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/frame')>()),
  addEventListenerToAllWindowsDynamic: iframeListenerMocks.addEventListenerToAllWindowsDynamicMock,
  addWindowEventListenerToAllWindowsDynamic:
    iframeListenerMocks.addWindowEventListenerToAllWindowsDynamicMock,
  addScrollListenersToAllWindows: iframeListenerMocks.addScrollListenersToAllWindowsMock,
}));

import { registerHighlighterRuntimeListeners } from './runtime-listeners';
import { createHoverControllerStub } from './controller.test-support';

beforeEach(() => {
  iframeListenerMocks.cleanupFns.length = 0;
  iframeListenerMocks.registrations.length = 0;
  iframeListenerMocks.scrollHandlers.length = 0;
  iframeListenerMocks.addEventListenerToAllWindowsDynamicMock.mockClear();
  iframeListenerMocks.addWindowEventListenerToAllWindowsDynamicMock.mockClear();
  iframeListenerMocks.addScrollListenersToAllWindowsMock.mockClear();
});

describe('registerHighlighterRuntimeListeners', () => {
  it('registers hover and escape listeners and tears them down together', () => {
    const hoverController = createHoverControllerStub();
    const disableHighlighterMode = vi.fn();
    const cleanup = registerHighlighterRuntimeListeners({
      disableHighlighterMode,
      hasActivePopover: () => false,
      hoverController,
      isAnyFrameEditing: () => false,
    });

    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'dragstart',
      hoverController.handleDragStart,
      { capture: true }
    );
    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'mousedown',
      hoverController.handleMouseDown,
      { capture: true }
    );
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
    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'pointerdown',
      hoverController.handlePointerDown,
      { capture: true }
    );
    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'pointermove',
      hoverController.handlePointerMove,
      { capture: true }
    );
    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'pointerup',
      hoverController.handlePointerUp,
      { capture: true }
    );
    expect(iframeListenerMocks.addScrollListenersToAllWindowsMock).toHaveBeenCalledTimes(1);
    expect(iframeListenerMocks.addWindowEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
      { capture: true }
    );

    cleanup();

    expect(iframeListenerMocks.cleanupFns).toHaveLength(11);
    expect(iframeListenerMocks.cleanupFns.every((fn) => fn.mock.calls.length === 1)).toBe(true);
  });

  it('cancels drawing and hover state together when the pointer leaves the viewport', () => {
    const hoverController = createHoverControllerStub();
    const cleanup = registerHighlighterRuntimeListeners({
      disableHighlighterMode: vi.fn(),
      hasActivePopover: () => false,
      hoverController,
      isAnyFrameEditing: () => false,
    });
    const mouseLeave = iframeListenerMocks.registrations.find(
      (registration) => registration.event === 'mouseleave'
    );

    mouseLeave?.handler(new MouseEvent('mouseleave'));

    expect(hoverController.cancelDrawing).toHaveBeenCalledWith('mouseleave');
    expect(hoverController.handleMouseLeave).toHaveBeenCalledOnce();
    cleanup();
  });

  it('hides the hover preview when scrolling invalidates its visible target', () => {
    const hoverController = createHoverControllerStub();
    const cleanup = registerHighlighterRuntimeListeners({
      disableHighlighterMode: vi.fn(),
      hasActivePopover: () => false,
      hoverController,
      isAnyFrameEditing: () => false,
    });

    iframeListenerMocks.scrollHandlers[0]?.();

    expect(hoverController.cancelDrawing).toHaveBeenCalledWith('scroll');
    expect(hoverController.hideHoverOverlay).toHaveBeenCalledOnce();
    cleanup();
  });
});
