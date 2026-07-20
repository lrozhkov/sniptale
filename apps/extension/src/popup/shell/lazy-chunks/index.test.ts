import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackPopupPerfAsyncMock = vi.hoisted(() =>
  vi.fn((_: string, loader: () => Promise<unknown>) => loader())
);

vi.mock('../../diagnostics/performance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../diagnostics/performance')>()),
  trackPopupPerfAsync: trackPopupPerfAsyncMock,
}));

vi.mock('../../recording/video/active-page', () => ({
  default: () => null,
}));

vi.mock('../../recording/video/setup', () => ({
  default: () => null,
}));

vi.mock('../export/pages/page', () => ({
  ExportPage: () => null,
}));

vi.mock('../command-palette', () => ({
  default: () => null,
}));

describe('popup lazy chunks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('memoizes deferred popup view preloads and records every chunk loader', async () => {
    const { preloadPopupDeferredViews } = await import('./index');

    const firstPromise = preloadPopupDeferredViews();
    const secondPromise = preloadPopupDeferredViews();

    await firstPromise;

    expect(secondPromise).toBe(firstPromise);
    expect(trackPopupPerfAsyncMock).toHaveBeenCalledTimes(4);
    expect(trackPopupPerfAsyncMock.mock.calls.map(([name]) => name)).toEqual([
      'popup.chunk.video-active',
      'popup.chunk.video-setup',
      'popup.chunk.export',
      'popup.chunk.command-palette',
    ]);
  });

  it('resets the cached preload promise after a failed deferred-load attempt', async () => {
    trackPopupPerfAsyncMock.mockImplementationOnce(async () => {
      throw new Error('chunk failed');
    });

    const { preloadPopupDeferredViews } = await import('./index');

    await expect(preloadPopupDeferredViews()).rejects.toThrow('chunk failed');

    trackPopupPerfAsyncMock.mockImplementation((_: string, loader: () => Promise<unknown>) =>
      loader()
    );

    await expect(preloadPopupDeferredViews()).resolves.toBeUndefined();
    expect(trackPopupPerfAsyncMock.mock.calls.length).toBeGreaterThan(4);
  });
});
