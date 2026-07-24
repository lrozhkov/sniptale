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

vi.mock('../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/frame')>()),
  addEventListenerToAllWindowsDynamic: iframeListenerMocks.addEventListenerToAllWindowsDynamicMock,
  addScrollListenersToAllWindows: iframeListenerMocks.addScrollListenersToAllWindowsMock,
}));

import { registerHighlighterRuntimeListeners } from './runtime-listeners';
import { createHoverControllerStub } from './controller.test-support';

beforeEach(() => {
  iframeListenerMocks.cleanupFns.length = 0;
  iframeListenerMocks.registrations.length = 0;
  iframeListenerMocks.addEventListenerToAllWindowsDynamicMock.mockClear();
  iframeListenerMocks.addScrollListenersToAllWindowsMock.mockClear();
});

describe('registerHighlighterRuntimeListeners', () => {
  it('registers hover and escape listeners and tears them down together', () => {
    const hoverController = createHoverControllerStub();
    const disableHighlighterMode = vi.fn();
    const cleanup = registerHighlighterRuntimeListeners({
      disableHighlighterMode,
      hoverController,
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
    expect(iframeListenerMocks.addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
      { capture: true }
    );

    cleanup();

    expect(iframeListenerMocks.cleanupFns).toHaveLength(9);
    expect(iframeListenerMocks.cleanupFns.every((fn) => fn.mock.calls.length === 1)).toBe(true);
  });

  it('cancels drawing and hover state together when the pointer leaves the viewport', () => {
    const hoverController = createHoverControllerStub();
    const cleanup = registerHighlighterRuntimeListeners({
      disableHighlighterMode: vi.fn(),
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
});
