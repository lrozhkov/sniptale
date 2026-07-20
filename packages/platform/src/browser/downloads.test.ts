import { afterEach, expect, it, vi } from 'vitest';

import { browserDownloads } from './downloads';

function installChromeDownloadsStub() {
  const onChanged = { addListener: vi.fn(), removeListener: vi.fn() };
  const chromeStub = {
    downloads: {
      download: vi.fn((_options, callback) => callback(7)),
      onChanged,
      search: vi.fn((_query, callback) => callback([{ id: 7 }])),
    },
    runtime: { lastError: undefined as { message: string } | undefined },
  };

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });

  return { chromeStub, onChanged };
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

it('downloads, searches, and subscribes to download change events', async () => {
  const { chromeStub, onChanged } = installChromeDownloadsStub();
  const listener = vi.fn();

  expect(browserDownloads.isAvailable()).toBe(true);
  await expect(
    browserDownloads.download({ filename: 'capture.png', url: 'blob:test' })
  ).resolves.toBe(7);
  await expect(browserDownloads.search({ filenameRegex: 'capture' })).resolves.toEqual([{ id: 7 }]);

  const unsubscribe = browserDownloads.subscribeToChanged(listener as never);
  expect(chromeStub.downloads.download).toHaveBeenCalled();
  expect(chromeStub.downloads.search).toHaveBeenCalled();
  expect(onChanged.addListener).toHaveBeenCalledWith(listener);

  unsubscribe();
  expect(onChanged.removeListener).toHaveBeenCalledWith(listener);
});

it('rejects download and search when chrome.downloads is unavailable', async () => {
  installChromeRuntimeOnlyStub();
  expect(browserDownloads.isAvailable()).toBe(false);
  await expect(
    browserDownloads.download({ filename: 'capture.png', url: 'blob:test' })
  ).rejects.toThrow('chrome.downloads is unavailable');
  await expect(browserDownloads.search({})).rejects.toThrow('chrome.downloads is unavailable');
});
