import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserWindows } from './windows';

afterEach(() => {
  resetChromeGlobal();
});

function installChromeGlobal(chromeStub: unknown) {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });
}

function resetChromeGlobal() {
  Reflect.deleteProperty(globalThis, 'chrome');
}

describe('browser windows adapter', () => {
  it('forwards window creation to chrome.windows', async () => {
    const create = vi.fn().mockResolvedValue({ id: 7 });
    installChromeGlobal({ windows: { create } });

    await expect(
      browserWindows.create({
        state: 'maximized',
        type: 'popup',
        url: 'chrome-extension://test/page.html',
      })
    ).resolves.toEqual({ id: 7 });

    expect(create).toHaveBeenCalledWith({
      state: 'maximized',
      type: 'popup',
      url: 'chrome-extension://test/page.html',
    });
  });

  it('rejects when the windows API is unavailable', async () => {
    installChromeGlobal({});

    await expect(
      browserWindows.create({ url: 'chrome-extension://test/page.html' })
    ).rejects.toThrow('chrome.windows.create is unavailable');
  });

  it('forwards window lookups to chrome.windows', async () => {
    const get = vi.fn().mockResolvedValue({ id: 7, width: 1600 });
    installChromeGlobal({ windows: { get } });

    await expect(browserWindows.get(7)).resolves.toEqual({ id: 7, width: 1600 });
    await expect(browserWindows.get(8, { populate: true })).resolves.toEqual({
      id: 7,
      width: 1600,
    });

    expect(get).toHaveBeenNthCalledWith(1, 7);
    expect(get).toHaveBeenNthCalledWith(2, 8, { populate: true });
  });

  it('rejects when the windows get API is unavailable', async () => {
    installChromeGlobal({ windows: {} });

    await expect(browserWindows.get(7)).rejects.toThrow('chrome.windows.get is unavailable');
  });

  it('forwards exact window updates and rejects when update is unavailable', async () => {
    const update = vi.fn().mockResolvedValue({ height: 720, id: 7, width: 1280 });
    installChromeGlobal({ windows: { update } });

    await expect(
      browserWindows.update(7, { height: 720, left: -1280, top: 0, width: 1280 })
    ).resolves.toEqual({ height: 720, id: 7, width: 1280 });
    expect(update).toHaveBeenCalledWith(7, {
      height: 720,
      left: -1280,
      top: 0,
      width: 1280,
    });

    installChromeGlobal({ windows: {} });
    await expect(browserWindows.update(7, { state: 'normal' })).rejects.toThrow(
      'chrome.windows.update is unavailable'
    );
  });

  it('subscribes and unsubscribes from bounds changes with an unavailable no-op fallback', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const listener = vi.fn();
    installChromeGlobal({ windows: { onBoundsChanged: { addListener, removeListener } } });

    const unsubscribe = browserWindows.subscribeBoundsChanged(listener);
    expect(addListener).toHaveBeenCalledWith(listener);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(listener);

    resetChromeGlobal();
    expect(() => browserWindows.subscribeBoundsChanged(listener)()).not.toThrow();
  });
});
