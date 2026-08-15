// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { setupSelectionModeRuntimeListeners } from '.';

beforeEach(() => {
  vi.clearAllMocks();
});

function createRuntimeListenerScenario() {
  const handleClick = vi.fn();
  const handleDragStart = vi.fn();
  const handleKeyDown = vi.fn();
  const handleMouseDown = vi.fn();
  const handleMouseLeave = vi.fn();
  const handleMouseMove = vi.fn();
  const handleMouseUp = vi.fn();
  const hideHoverFrame = vi.fn();
  const session = createSelectionModeSession();

  setupSelectionModeRuntimeListeners({
    hideHoverFrame,
    session,
    setupListenerHandlers: {
      handleClick,
      handleDragStart,
      handleKeyDown,
      handleMouseDown,
      handleMouseLeave,
      handleMouseMove,
      handleMouseUp,
    },
  });

  return {
    handlers: {
      handleClick,
      handleDragStart,
      handleKeyDown,
      handleMouseDown,
      handleMouseLeave,
      handleMouseMove,
      handleMouseUp,
    },
    hideHoverFrame,
    session,
  };
}

function expectListenerCleanupLifecycle() {
  const cleanupFns = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
  const scrollCleanup = vi.fn();
  addEventListenerToAllWindowsDynamicMock
    .mockReturnValueOnce(cleanupFns[0])
    .mockReturnValueOnce(cleanupFns[1])
    .mockReturnValueOnce(cleanupFns[2])
    .mockReturnValueOnce(cleanupFns[3])
    .mockReturnValueOnce(cleanupFns[4])
    .mockReturnValueOnce(cleanupFns[5])
    .mockReturnValueOnce(cleanupFns[6]);
  addScrollListenersToAllWindowsMock.mockReturnValue(scrollCleanup);
  const scenario = createRuntimeListenerScenario();

  expect(addEventListenerToAllWindowsDynamicMock.mock.calls.map(([event]) => event)).toEqual([
    'dragstart',
    'mousemove',
    'mousedown',
    'mouseup',
    'click',
    'keydown',
    'mouseleave',
  ]);
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[0]?.[1]).toBe(
    scenario.handlers.handleDragStart
  );
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[1]?.[1]).toBe(
    scenario.handlers.handleMouseMove
  );
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[2]?.[1]).toBe(
    scenario.handlers.handleMouseDown
  );
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[3]?.[1]).toBe(
    scenario.handlers.handleMouseUp
  );
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[4]?.[1]).toBe(
    scenario.handlers.handleClick
  );
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls[5]?.[1]).toBe(
    scenario.handlers.handleKeyDown
  );
  addEventListenerToAllWindowsDynamicMock.mock.calls[6]?.[1](new MouseEvent('mouseleave'));
  expect(scenario.handlers.handleMouseLeave).toHaveBeenCalledOnce();

  scenario.session.cleanupEventListeners?.();

  cleanupFns.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1));
  expect(scenario.session.cleanupScrollListeners).toBe(scrollCleanup);
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
  const scenario = createRuntimeListenerScenario();
  scenario.session.currentState = 'hover';

  const triggerScroll = () => scrollHandler?.();
  triggerScroll();
  scenario.session.currentState = 'drag';
  triggerScroll();
  scenario.session.currentState = 'idle';
  triggerScroll();

  expect(scenario.hideHoverFrame).toHaveBeenCalledTimes(2);
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
