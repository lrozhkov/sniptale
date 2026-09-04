// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  disposeExistingContentRuntime,
  hasRegisteredContentRuntimeCleanup,
  registerContentRuntimeCleanup,
  runWhenContentBodyReady,
} from './lifecycle';
import { CONTENT_RUNTIME_CLEANUP_KEY } from './markers';

type ContentRuntimeGlobal = typeof globalThis & {
  [CONTENT_RUNTIME_CLEANUP_KEY]?: () => void;
};

const runtimeGlobal = globalThis as ContentRuntimeGlobal;

beforeEach(() => {
  delete runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];
});

afterEach(() => {
  delete runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('content entrypoint cleanup lifecycle', () => {
  it('clears the global authority before disposing the registered runtime', () => {
    const cleanup = vi.fn(() => {
      expect(runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY]).toBeUndefined();
    });
    registerContentRuntimeCleanup(cleanup);
    expect(hasRegisteredContentRuntimeCleanup()).toBe(true);

    disposeExistingContentRuntime();
    disposeExistingContentRuntime();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(hasRegisteredContentRuntimeCleanup()).toBe(false);
    expect(runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY]).toBeUndefined();
  });

  it('clears the global authority when direct cleanup fails', () => {
    registerContentRuntimeCleanup(() => {
      throw new Error('cleanup failed');
    });

    expect(() => runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY]?.()).toThrow('cleanup failed');
    expect(runtimeGlobal[CONTENT_RUNTIME_CLEANUP_KEY]).toBeUndefined();
  });
});

describe('content entrypoint body readiness', () => {
  it('coalesces duplicate scheduling and removes readiness observers before initialization', () => {
    vi.useFakeTimers();
    const originalBody = document.body;
    document.documentElement.removeChild(originalBody);
    const disconnect = vi.fn();
    const observe = vi.fn();
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const initialize = vi.fn(() => {
      expect(disconnect).toHaveBeenCalledOnce();
      expect(removeEventListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));
    });
    const duplicateInitialize = vi.fn();
    const readyStateDescriptor = Object.getOwnPropertyDescriptor(document, 'readyState');
    Object.defineProperty(document, 'readyState', { configurable: true, value: 'loading' });
    vi.stubGlobal(
      'MutationObserver',
      class {
        disconnect = disconnect;
        observe = observe;
      }
    );

    try {
      runWhenContentBodyReady(initialize);
      runWhenContentBodyReady(duplicateInitialize);
      const nextBody = document.createElement('body');
      document.documentElement.appendChild(nextBody);

      vi.runOnlyPendingTimers();

      expect(initialize).toHaveBeenCalledOnce();
      expect(duplicateInitialize).not.toHaveBeenCalled();
      expect(observe).toHaveBeenCalledOnce();
      expect(disconnect).toHaveBeenCalledOnce();
      expect(addEventListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function), {
        once: true,
      });
      expect(removeEventListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function));
    } finally {
      document.body?.remove();
      document.documentElement.appendChild(originalBody);
      if (readyStateDescriptor) {
        Object.defineProperty(document, 'readyState', readyStateDescriptor);
      } else {
        Reflect.deleteProperty(document, 'readyState');
      }
    }
  });
});
