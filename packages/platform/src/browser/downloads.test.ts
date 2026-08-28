import { afterEach, expect, it, vi } from 'vitest';

import { browserDownloads } from './downloads';

function installChromeDownloadsStub() {
  const onChanged = { addListener: vi.fn(), removeListener: vi.fn() };
  const onCreated = { addListener: vi.fn(), removeListener: vi.fn() };
  const chromeStub = {
    downloads: {
      cancel: vi.fn((_downloadId, callback) => callback()),
      download: vi.fn((_options, callback) => callback(7)),
      onChanged,
      onCreated,
      search: vi.fn((_query, callback) => callback([{ id: 7 }])),
    },
    runtime: { lastError: undefined as { message: string } | undefined },
  };

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });

  return { chromeStub, onChanged, onCreated };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

function installChromeRuntimeOnlyStub() {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      downloads: undefined,
      runtime: { lastError: undefined as { message: string } | undefined },
    },
    writable: true,
  });
}

it('downloads, cancels, searches, and subscribes to download change events', async () => {
  const { chromeStub, onChanged, onCreated } = installChromeDownloadsStub();
  const createdListener = vi.fn<(item: chrome.downloads.DownloadItem) => void>();
  const changedListener = vi.fn<(delta: chrome.downloads.DownloadDelta) => void>();

  expect(browserDownloads.isAvailable()).toBe(true);
  await expect(
    browserDownloads.download({ filename: 'capture.png', url: 'blob:test' })
  ).resolves.toBe(7);
  await expect(browserDownloads.cancel(7)).resolves.toBeUndefined();
  await expect(browserDownloads.search({ filenameRegex: 'capture' })).resolves.toEqual([{ id: 7 }]);

  const unsubscribeCreated = browserDownloads.subscribeToCreated(createdListener);
  const unsubscribe = browserDownloads.subscribeToChanged(changedListener);
  expect(chromeStub.downloads.download).toHaveBeenCalled();
  expect(chromeStub.downloads.cancel).toHaveBeenCalledWith(7, expect.any(Function));
  expect(chromeStub.downloads.search).toHaveBeenCalled();
  expect(onCreated.addListener).toHaveBeenCalledWith(createdListener);
  expect(onChanged.addListener).toHaveBeenCalledWith(changedListener);

  unsubscribeCreated();
  unsubscribe();
  expect(onCreated.removeListener).toHaveBeenCalledWith(createdListener);
  expect(onChanged.removeListener).toHaveBeenCalledWith(changedListener);
});

it('rejects download, cancellation, and search when chrome.downloads is unavailable', async () => {
  installChromeRuntimeOnlyStub();
  expect(browserDownloads.isAvailable()).toBe(false);
  await expect(
    browserDownloads.download({ filename: 'capture.png', url: 'blob:test' })
  ).rejects.toThrow('chrome.downloads is unavailable');
  await expect(browserDownloads.cancel(7)).rejects.toThrow('chrome.downloads is unavailable');
  await expect(browserDownloads.search({})).rejects.toThrow('chrome.downloads is unavailable');
});
