import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiPickLazyMocks = vi.hoisted(() => ({
  disableAiPickModeMock: vi.fn(),
  enableAiPickModeMock: vi.fn(),
  runtimeModuleDeferred: {
    promise: Promise.resolve(),
    resolve: () => undefined,
  } as { promise: Promise<void>; resolve: () => void },
}));

function createDeferredPromise() {
  let resolvePromise: (() => void) | null = null;

  return {
    promise: new Promise<void>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve: () => resolvePromise?.(),
  };
}

vi.mock('./runtime', () => ({
  disableAiPickMode: aiPickLazyMocks.disableAiPickModeMock,
  enableAiPickMode: aiPickLazyMocks.enableAiPickModeMock,
}));

describe('ai-pick lazy loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    aiPickLazyMocks.runtimeModuleDeferred = createDeferredPromise();
  });

  it('reuses the cached ai-pick runtime module for preload and deferred enable', async () => {
    const { enableAiPickModeDeferred, preloadAiPickRuntime } = await import('./lazy');
    const onSelect = vi.fn();

    await expect(preloadAiPickRuntime()).resolves.toBeUndefined();
    await expect(enableAiPickModeDeferred(onSelect)).resolves.toBeUndefined();

    expect(aiPickLazyMocks.enableAiPickModeMock).toHaveBeenCalledTimes(1);
    expect(aiPickLazyMocks.enableAiPickModeMock).toHaveBeenCalledWith(onSelect);
  });

  it('does not force-load ai-pick runtime on disable', async () => {
    const { disableAiPickModeIfLoaded } = await import('./lazy');

    disableAiPickModeIfLoaded();

    expect(aiPickLazyMocks.disableAiPickModeMock).not.toHaveBeenCalled();
  });

  it('cancels deferred enable when disable happens before runtime import resolves', async () => {
    vi.doMock('./runtime', async () => {
      await aiPickLazyMocks.runtimeModuleDeferred.promise;

      return {
        disableAiPickMode: aiPickLazyMocks.disableAiPickModeMock,
        enableAiPickMode: aiPickLazyMocks.enableAiPickModeMock,
      };
    });

    const { disableAiPickModeIfLoaded, enableAiPickModeDeferred } = await import('./lazy');
    const enablePromise = enableAiPickModeDeferred(vi.fn());

    disableAiPickModeIfLoaded();
    aiPickLazyMocks.runtimeModuleDeferred.resolve();
    await enablePromise;

    expect(aiPickLazyMocks.enableAiPickModeMock).not.toHaveBeenCalled();
  });
});
