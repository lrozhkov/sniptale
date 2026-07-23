// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';
import { createSelectionModeSession } from '../../session';

const {
  addEventListenerToAllWindowsDynamicMock,
  addScrollListenersToAllWindowsMock,
  logSelectionModeRuntimeMock,
} = vi.hoisted(() => ({
  addEventListenerToAllWindowsDynamicMock: vi.fn(),
  addScrollListenersToAllWindowsMock: vi.fn(),
  logSelectionModeRuntimeMock: vi.fn(),
}));

vi.mock('../../../../platform/frame', () => ({
  addEventListenerToAllWindowsDynamic: addEventListenerToAllWindowsDynamicMock,
  addScrollListenersToAllWindows: addScrollListenersToAllWindowsMock,
}));

vi.mock('../../diag', () => ({
  logSelectionModeRuntime: logSelectionModeRuntimeMock,
}));

import { setupSelectionModeEventListeners, setupSelectionModeRuntimeListeners } from '.';

beforeEach(() => {
  vi.clearAllMocks();
});

function expectListenerCleanupLifecycle() {
  const cleanupFns = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
  addEventListenerToAllWindowsDynamicMock
    .mockReturnValueOnce(cleanupFns[0])
    .mockReturnValueOnce(cleanupFns[1])
    .mockReturnValueOnce(cleanupFns[2])
    .mockReturnValueOnce(cleanupFns[3])
    .mockReturnValueOnce(cleanupFns[4])
    .mockReturnValueOnce(cleanupFns[5]);
  addScrollListenersToAllWindowsMock.mockReturnValue(vi.fn());
  const setCleanupEventListeners = vi.fn();
  const keyDownHandler = vi.fn<(event: KeyboardEvent) => void>();
  const mouseLeaveHandler = vi.fn();

  setupSelectionModeEventListeners({
    currentState: () => 'idle',
    handleClick: vi.fn(),
    handleKeyDown: keyDownHandler,
    handleMouseDown: vi.fn(),
    handleMouseLeave: mouseLeaveHandler,
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
    hideHoverFrame: vi.fn(),
    setCleanupEventListeners,
    setCleanupScrollListeners: vi.fn(),
  });

  expect(addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledTimes(6);
  expect(addEventListenerToAllWindowsDynamicMock).toHaveBeenNthCalledWith(
    5,
    'keydown',
    keyDownHandler,
    { capture: true }
  );
  expect(addEventListenerToAllWindowsDynamicMock).toHaveBeenNthCalledWith(
    6,
    'mouseleave',
    expect.any(Function),
    { capture: true }
  );

  const cleanup = setCleanupEventListeners.mock.calls[0]?.[0] as () => void;
  cleanup();

  cleanupFns.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('Attaching selection listeners');
  expect(logSelectionModeRuntimeMock).toHaveBeenCalledWith('Cleaning selection listeners');
}

function expectHoverFrameScrollLifecycle() {
  let scrollHandler: (() => void) | null = null;
  addEventListenerToAllWindowsDynamicMock.mockReturnValue(vi.fn());
  addScrollListenersToAllWindowsMock.mockImplementation((handler: () => void) => {
    scrollHandler = handler;
    return vi.fn();
  });
  const hideHoverFrame = vi.fn();
  let currentState = 'hover';

  setupSelectionModeEventListeners({
    currentState: () => currentState,
    handleClick: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
    hideHoverFrame,
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
  });

  const triggerScroll = () => scrollHandler?.();

  triggerScroll();
  currentState = 'drag';
  triggerScroll();
  currentState = 'idle';
  triggerScroll();

  expect(hideHoverFrame).toHaveBeenCalledTimes(2);
}

function expectRuntimeListenerContract() {
  let scrollHandler: (() => void) | null = null;
  addEventListenerToAllWindowsDynamicMock.mockReturnValue(vi.fn());
  addScrollListenersToAllWindowsMock.mockImplementation((handler: () => void) => {
    scrollHandler = handler;
    return vi.fn();
  });
  const handleClick = vi.fn();
  const handleKeyDown = vi.fn();
  const handleMouseDown = vi.fn();
  const handleMouseLeave = vi.fn();
  const handleMouseMove = vi.fn();
  const handleMouseUp = vi.fn();
  const hideHoverFrame = vi.fn();
  const setCleanupEventListeners = vi.fn();
  const setCleanupScrollListeners = vi.fn();
  const state = createSelectionModeSession();
  state.currentState = 'drag';
  const runtimeArgs: SelectionModeRuntimeActionsArgs = {
    createDragFrame: vi.fn(),
    getAbsolutePosition: vi.fn(() => ({ height: 10, width: 10, x: 0, y: 0 })),
    getMaxSelectionHeight: vi.fn(() => 720),
    getMaxSelectionWidth: vi.fn(() => 1280),
    hideHoverFrame,
    minSelectionSize: 10,
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
    showFinalFrame: vi.fn(),
    showHoverFrameDom: vi.fn(),
    state,
    updateFinalFrame: vi.fn(),
    zIndexBase: 2_147_483_644,
  };

  setupSelectionModeRuntimeListeners(runtimeArgs);

  expect(addEventListenerToAllWindowsDynamicMock.mock.calls.map(([event]) => event)).toEqual([
    'mousemove',
    'mousedown',
    'mouseup',
    'click',
    'keydown',
    'mouseleave',
  ]);
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[0]?.[1]).toBe(handleMouseMove);
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[1]?.[1]).toBe(handleMouseDown);
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[2]?.[1]).toBe(handleMouseUp);
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[3]?.[1]).toBe(handleClick);
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[4]?.[1]).toBe(handleKeyDown);
  addEventListenerToAllWindowsDynamicMock.mock.calls[5]?.[1](new MouseEvent('mouseleave'));
  expect(handleMouseLeave).toHaveBeenCalledOnce();

  const triggerScroll = () => scrollHandler?.();
  triggerScroll();
  expect(hideHoverFrame).not.toHaveBeenCalled();
  state.currentState = 'hover';
  triggerScroll();
  expect(hideHoverFrame).toHaveBeenCalledOnce();
  expect(setCleanupEventListeners).toHaveBeenCalledOnce();
  expect(setCleanupScrollListeners).toHaveBeenCalledOnce();
}

describe('selection-mode listener cleanup', () => {
  it('registers dynamic listeners and exposes a cleanup callback', expectListenerCleanupLifecycle);
});

describe('selection-mode listener scroll handling', () => {
  it(
    'hides the hover frame on scroll only for hover and idle runtime states',
    expectHoverFrameScrollLifecycle
  );
});

describe('selection-mode runtime listener contract', () => {
  it('binds runtime handlers and reads the live session state', expectRuntimeListenerContract);
});
