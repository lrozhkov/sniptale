import { afterEach, expect, it, vi } from 'vitest';

import { browserDesktopCapture } from './desktop-capture';

type DesktopCaptureCallback = (streamId: string, options?: { name?: string }) => void;
type DesktopCaptureStub = {
  chooseDesktopMedia: ReturnType<typeof vi.fn>;
};
type DesktopCaptureChromeStub = {
  desktopCapture?: DesktopCaptureStub;
  runtime: { lastError?: { message?: string } };
};

const originalChrome = (globalThis as { chrome?: typeof chrome }).chrome;

function createChromeStub(): DesktopCaptureChromeStub {
  return {
    desktopCapture: { chooseDesktopMedia: vi.fn() },
    runtime: {},
  };
}

function installChromeStub(chromeStub: DesktopCaptureChromeStub): void {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });
}

function restoreChromeStub(): void {
  if (originalChrome === undefined) {
    Reflect.deleteProperty(globalThis, 'chrome');
    return;
  }

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: originalChrome,
    writable: true,
  });
}

function getDesktopCapture(chromeStub: DesktopCaptureChromeStub): DesktopCaptureStub {
  if (!chromeStub.desktopCapture) {
    throw new Error('desktopCapture stub is unavailable');
  }
  return chromeStub.desktopCapture;
}

afterEach(() => {
  restoreChromeStub();
});

it('normalizes selected desktop sources with a target tab', async () => {
  const chromeStub = createChromeStub();
  const desktopCapture = getDesktopCapture(chromeStub);
  const tab = { id: 7 } as chrome.tabs.Tab;
  desktopCapture.chooseDesktopMedia.mockImplementation(
    (_sources: string[], _tab: chrome.tabs.Tab, callback: DesktopCaptureCallback) => {
      callback('desktop-stream', { name: 'Screen 1' });
      return 1;
    }
  );
  installChromeStub(chromeStub);

  await expect(
    browserDesktopCapture.chooseDesktopMedia({ sources: ['screen'], targetTab: tab })
  ).resolves.toEqual({
    status: 'selected',
    selection: { label: 'Screen 1', streamId: 'desktop-stream' },
  });
  expect(desktopCapture.chooseDesktopMedia).toHaveBeenCalledWith(
    ['screen'],
    tab,
    expect.any(Function)
  );
});

it('normalizes selected desktop sources without a label', async () => {
  const chromeStub = createChromeStub();
  const desktopCapture = getDesktopCapture(chromeStub);
  desktopCapture.chooseDesktopMedia.mockImplementation(
    (_sources: string[], callback: DesktopCaptureCallback) => {
      callback('desktop-stream');
      return 1;
    }
  );
  installChromeStub(chromeStub);

  await expect(browserDesktopCapture.chooseDesktopMedia({ sources: ['window'] })).resolves.toEqual({
    status: 'selected',
    selection: { label: '', streamId: 'desktop-stream' },
  });
});

it('normalizes cancelled source selection', async () => {
  const chromeStub = createChromeStub();
  const desktopCapture = getDesktopCapture(chromeStub);
  desktopCapture.chooseDesktopMedia.mockImplementation(
    (_sources: string[], callback: DesktopCaptureCallback) => {
      callback('');
      return 1;
    }
  );
  installChromeStub(chromeStub);

  await expect(browserDesktopCapture.chooseDesktopMedia({ sources: ['window'] })).resolves.toEqual({
    status: 'cancelled',
  });
  expect(desktopCapture.chooseDesktopMedia).toHaveBeenCalledWith(['window'], expect.any(Function));
});

it('normalizes runtime errors without requiring a browser message', async () => {
  const chromeStub = createChromeStub();
  const desktopCapture = getDesktopCapture(chromeStub);
  desktopCapture.chooseDesktopMedia.mockImplementation(
    (_sources: string[], callback: DesktopCaptureCallback) => {
      chromeStub.runtime.lastError = {};
      callback('');
      delete chromeStub.runtime.lastError;
      return 1;
    }
  );
  installChromeStub(chromeStub);

  await expect(browserDesktopCapture.chooseDesktopMedia({ sources: ['window'] })).resolves.toEqual({
    error: 'Desktop media picker failed',
    status: 'failed',
  });
});

it('normalizes thrown picker errors', async () => {
  const chromeStub = createChromeStub();
  const desktopCapture = getDesktopCapture(chromeStub);
  desktopCapture.chooseDesktopMedia.mockImplementation(() => {
    throw 'activation expired';
  });
  installChromeStub(chromeStub);

  await expect(browserDesktopCapture.chooseDesktopMedia({ sources: ['window'] })).resolves.toEqual({
    error: 'activation expired',
    status: 'failed',
  });
});

it('reports unavailable desktopCapture access as a failed selection', async () => {
  installChromeStub({ runtime: {} });

  expect(browserDesktopCapture.isAvailable()).toBe(false);
  await expect(browserDesktopCapture.chooseDesktopMedia({ sources: ['window'] })).resolves.toEqual({
    error: 'chrome.desktopCapture.chooseDesktopMedia is unavailable',
    status: 'failed',
  });
});
