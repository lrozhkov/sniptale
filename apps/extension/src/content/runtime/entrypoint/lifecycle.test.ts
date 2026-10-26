// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  disposeExistingContentRuntime,
  hasRegisteredContentRuntimeCleanup,
  registerContentRuntimeCleanup,
  runWhenContentBodyReady,
} from './lifecycle';
import {
  CONTENT_RUNTIME_CLEANUP_KEY,
  installContentRuntimeReleaseGuard,
  requestFullContentRuntimeRelease,
} from './markers';

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

describe('guarded full runtime handback', () => {
  it('refuses missing and active guards and releases the canonical cleanup once', async () => {
    const cleanup = vi.fn();
    registerContentRuntimeCleanup(cleanup);
    expect(await requestFullContentRuntimeRelease()).toBe(false);
    const dispose = installContentRuntimeReleaseGuard(async () => false);
    expect(await requestFullContentRuntimeRelease()).toBe(false);
    installContentRuntimeReleaseGuard(async () => true);
    dispose();
    expect(await requestFullContentRuntimeRelease()).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(hasRegisteredContentRuntimeCleanup()).toBe(false);
    expect(await requestFullContentRuntimeRelease()).toBe(false);
  });
  it('does not release a replacement runtime after a delayed accepted decision', async () => {
    let accept!: (value: boolean) => void;
    const oldCleanup = vi.fn();
    const newCleanup = vi.fn();
    registerContentRuntimeCleanup(oldCleanup);
    installContentRuntimeReleaseGuard(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        })
    );
    const release = requestFullContentRuntimeRelease();
    registerContentRuntimeCleanup(newCleanup);
    accept(true);
    expect(await release).toBe(false);
    expect(oldCleanup).not.toHaveBeenCalled();
    expect(newCleanup).not.toHaveBeenCalled();
  });
});
