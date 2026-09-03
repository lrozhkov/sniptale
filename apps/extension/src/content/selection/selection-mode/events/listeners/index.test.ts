// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionModeSession } from '../../session';

const {
  addEventListenerToAllWindowsDynamicMock,
  addWindowEventListenerToAllWindowsDynamicMock,
  addScrollListenersToAllWindowsMock,
  logSelectionModeRuntimeMock,
} = vi.hoisted(() => ({
  addEventListenerToAllWindowsDynamicMock: vi.fn(),
  addWindowEventListenerToAllWindowsDynamicMock: vi.fn(),
  addScrollListenersToAllWindowsMock: vi.fn(),
  logSelectionModeRuntimeMock: vi.fn(),
}));

vi.mock('../../../../platform/frame', () => ({
  addEventListenerToAllWindowsDynamic: addEventListenerToAllWindowsDynamicMock,
  addWindowEventListenerToAllWindowsDynamic: addWindowEventListenerToAllWindowsDynamicMock,
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
  addWindowEventListenerToAllWindowsDynamicMock
    .mockReturnValueOnce(cleanupFns[0])
    .mockReturnValueOnce(cleanupFns[1])
    .mockReturnValueOnce(cleanupFns[2])
    .mockReturnValueOnce(cleanupFns[3])
    .mockReturnValueOnce(cleanupFns[4])
    .mockReturnValueOnce(cleanupFns[5]);
  addEventListenerToAllWindowsDynamicMock.mockReturnValueOnce(cleanupFns[6]);
  addScrollListenersToAllWindowsMock.mockReturnValue(scrollCleanup);
  const scenario = createRuntimeListenerScenario();

  expect(addWindowEventListenerToAllWindowsDynamicMock.mock.calls.map(([event]) => event)).toEqual([
    'dragstart',
    'mousemove',
    'mousedown',
    'mouseup',
    'click',
    'keydown',
  ]);
  expect(addEventListenerToAllWindowsDynamicMock.mock.calls.map(([event]) => event)).toEqual([
    'mouseleave',
  ]);
  const windowHandlers = addWindowEventListenerToAllWindowsDynamicMock.mock.calls.map(
    ([, handler]) => handler
  );
  windowHandlers[0]?.(new Event('dragstart'), window);
  windowHandlers[1]?.(new MouseEvent('mousemove'), window);
  windowHandlers[2]?.(new MouseEvent('mousedown'), window);
  windowHandlers[3]?.(new MouseEvent('mouseup'), window);
  windowHandlers[4]?.(new MouseEvent('click'), window);
  windowHandlers[5]?.(new KeyboardEvent('keydown'), window);
  expect(scenario.handlers.handleDragStart).toHaveBeenCalledOnce();
  expect(scenario.handlers.handleMouseMove).toHaveBeenCalledOnce();
  expect(scenario.handlers.handleMouseDown).toHaveBeenCalledOnce();
  expect(scenario.handlers.handleMouseUp).toHaveBeenCalledOnce();
  expect(scenario.handlers.handleClick).toHaveBeenCalledOnce();
  expect(scenario.handlers.handleKeyDown).toHaveBeenCalledOnce();
  addEventListenerToAllWindowsDynamicMock.mock.calls[0]?.[1](new MouseEvent('mouseleave'));
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

  it('claims crop drag and resize gestures at window capture before GWT modal preview', () => {
    addEventListenerToAllWindowsDynamicMock.mockReturnValue(vi.fn());
    addWindowEventListenerToAllWindowsDynamicMock.mockReturnValue(vi.fn());

    createRuntimeListenerScenario();

    expect(
      addWindowEventListenerToAllWindowsDynamicMock.mock.calls.map(([event, , options]) => [
        event,
        options,
      ])
    ).toEqual([
      ['dragstart', { capture: true }],
      ['mousemove', { capture: true }],
      ['mousedown', { capture: true }],
      ['mouseup', { capture: true }],
      ['click', { capture: true }],
      ['keydown', { capture: true }],
    ]);
  });
});

describe('selection-mode listener scroll handling', () => {
  it(
    'hides the hover frame on scroll only for hover and idle runtime states',
    expectHoverFrameScrollLifecycle
  );
});
