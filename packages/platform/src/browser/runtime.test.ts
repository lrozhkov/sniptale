import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserRuntime } from './runtime';
import { createChromeStub } from './test-fixtures';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

function installChromeGlobal(chromeStub: unknown) {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: chromeStub,
    writable: true,
  });
}

describe('browser runtime adapter', () => {
  it('forwards runtime port connections to chrome.runtime', () => {
    const chromeStub = createChromeStub();
    const port = { disconnect: vi.fn(), name: 'viewer-port' };
    chromeStub.runtime.connect.mockReturnValue(port);
    installChromeGlobal(chromeStub);

    expect(browserRuntime.connect({ name: 'viewer-port' })).toBe(port);
    expect(chromeStub.runtime.connect).toHaveBeenCalledWith({ name: 'viewer-port' });
  });

  it('returns deterministic unsubscribe for install listeners', () => {
    const chromeStub = createChromeStub();
    installChromeGlobal(chromeStub);

    const listener = vi.fn();
    const unsubscribe = browserRuntime.subscribeToInstalled(listener);
    unsubscribe();

    expect(chromeStub.runtime.onInstalled.addListener).toHaveBeenCalledWith(listener);
    expect(chromeStub.runtime.onInstalled.removeListener).toHaveBeenCalledWith(listener);
  });
});
