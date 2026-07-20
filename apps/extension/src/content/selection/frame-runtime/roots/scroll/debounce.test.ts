// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedScrollHandler } from './debounce';

let nextAnimationFrameId = 0;
let animationFrameCallbacks: Map<number, FrameRequestCallback>;
let nextTimeoutId = 0;
let timeoutCallbacks: Map<number, () => void>;

beforeEach(() => {
  animationFrameCallbacks = new Map();
  nextAnimationFrameId = 0;
  timeoutCallbacks = new Map();
  nextTimeoutId = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      nextAnimationFrameId += 1;
      animationFrameCallbacks.set(nextAnimationFrameId, callback);
      return nextAnimationFrameId;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      animationFrameCallbacks.delete(id);
    })
  );
  const setTimeoutMock = ((callback: TimerHandler) => {
    nextTimeoutId += 1;
    timeoutCallbacks.set(nextTimeoutId, callback as () => void);
    return nextTimeoutId;
  }) as unknown as typeof window.setTimeout;
  const clearTimeoutMock = ((id?: Parameters<typeof window.clearTimeout>[0]) => {
    if (typeof id === 'number') {
      timeoutCallbacks.delete(id);
    }
  }) as unknown as typeof window.clearTimeout;
  vi.spyOn(window, 'setTimeout').mockImplementation(setTimeoutMock);
  vi.spyOn(window, 'clearTimeout').mockImplementation(clearTimeoutMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function runAnimationFrame(id: number) {
  const callback = animationFrameCallbacks.get(id);
  animationFrameCallbacks.delete(id);
  callback?.(0);
}

function runTimeout(id: number) {
  const callback = timeoutCallbacks.get(id);
  timeoutCallbacks.delete(id);
  callback?.();
}

function expectRepeatedScrollUsesLatestAnimationFrame(): void {
  const handleScroll = vi.fn();
  const { debouncedHandleScroll } = createDebouncedScrollHandler(handleScroll);

  debouncedHandleScroll();
  debouncedHandleScroll();

  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  expect(animationFrameCallbacks.has(1)).toBe(false);

  runAnimationFrame(2);

  expect(handleScroll).toHaveBeenCalledTimes(1);
}

function expectStabilizationWindowAfterScrollLayoutHandlers(): void {
  const handleScroll = vi.fn();
  const { debouncedHandleScroll } = createDebouncedScrollHandler(handleScroll);

  debouncedHandleScroll();

  runAnimationFrame(1);

  expect(handleScroll).toHaveBeenCalledTimes(1);
  expect(animationFrameCallbacks.has(2)).toBe(true);

  runAnimationFrame(2);
  runAnimationFrame(3);
  runAnimationFrame(4);

  expect(handleScroll).toHaveBeenCalledTimes(4);
}

function expectDeferredPassAfterDelayedDynamicHeaderRestore(): void {
  const handleScroll = vi.fn();
  const { debouncedHandleScroll } = createDebouncedScrollHandler(handleScroll);

  debouncedHandleScroll();

  runAnimationFrame(1);

  expect(handleScroll).toHaveBeenCalledTimes(1);
  expect(timeoutCallbacks.has(1)).toBe(true);

  runTimeout(1);

  expect(handleScroll).toHaveBeenCalledTimes(2);
}

function expectCleanupClearsPendingFrame(): void {
  const handleScroll = vi.fn();
  const { clearDebounce, debouncedHandleScroll } = createDebouncedScrollHandler(handleScroll);

  debouncedHandleScroll();
  clearDebounce();

  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  expect(animationFrameCallbacks.size).toBe(0);
  expect(handleScroll).not.toHaveBeenCalled();
}

function expectCleanupClearsSettledPass(): void {
  const handleScroll = vi.fn();
  const { clearDebounce, debouncedHandleScroll } = createDebouncedScrollHandler(handleScroll);

  debouncedHandleScroll();

  runAnimationFrame(1);
  clearDebounce();

  expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
  expect(clearTimeout).toHaveBeenCalledWith(1);
  expect(clearTimeout).toHaveBeenCalledWith(2);
  expect(clearTimeout).toHaveBeenCalledWith(3);
  expect(animationFrameCallbacks.size).toBe(0);
  expect(timeoutCallbacks.size).toBe(0);
  expect(handleScroll).toHaveBeenCalledTimes(1);
}

describe('frame-scroll-sync-debounce', () => {
  it(
    'debounces repeated scroll scheduling into the latest animation frame only',
    expectRepeatedScrollUsesLatestAnimationFrame
  );
  it(
    'runs a stabilization window after page scroll handlers update layout',
    expectStabilizationWindowAfterScrollLayoutHandlers
  );
  it(
    'runs a deferred pass after delayed dynamic header restoration',
    expectDeferredPassAfterDelayedDynamicHeaderRestore
  );
  it(
    'clears pending animation-frame work when debounce cleanup runs',
    expectCleanupClearsPendingFrame
  );
  it(
    'clears the pending settled pass after the first scroll frame runs',
    expectCleanupClearsSettledPass
  );
});
