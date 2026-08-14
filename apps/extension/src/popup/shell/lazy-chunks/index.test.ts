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

  it('warms only the Video setup and Export route resources', async () => {
    const {
      getResolvedExportPage,
      getResolvedVideoSetupPage,
      isPopupPagePreloaded,
      preloadPopupDeferredViews,
    } = await import('./index');

    expect(isPopupPagePreloaded('home')).toBe(true);
    expect(isPopupPagePreloaded('video')).toBe(false);
    expect(isPopupPagePreloaded('export')).toBe(false);
    expect(getResolvedVideoSetupPage()).toBeNull();
    expect(getResolvedExportPage()).toBeNull();

    const firstPromise = preloadPopupDeferredViews();
    const secondPromise = preloadPopupDeferredViews();

    await firstPromise;

    await secondPromise;
    expect(isPopupPagePreloaded('video')).toBe(true);
    expect(isPopupPagePreloaded('export')).toBe(true);
    expect(getResolvedVideoSetupPage()).not.toBeNull();
    expect(getResolvedExportPage()).not.toBeNull();
    expect(trackPopupPerfAsyncMock).toHaveBeenCalledTimes(2);
    expect(trackPopupPerfAsyncMock.mock.calls.map(([name]) => name)).toEqual([
      'popup.route.preload.video',
      'popup.route.preload.export',
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
    expect(trackPopupPerfAsyncMock).toHaveBeenCalledTimes(3);
  });
});
