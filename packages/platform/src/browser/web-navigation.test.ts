import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserWebNavigation } from './web-navigation';

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

describe('browser webNavigation adapter', () => {
  it('returns deterministic unsubscribe for before-navigate listeners', () => {
    const onBeforeNavigate = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    installChromeGlobal({ webNavigation: { onBeforeNavigate } });

    const listener = vi.fn();
    const unsubscribe = browserWebNavigation.subscribeToBeforeNavigate(listener);
    unsubscribe();

    expect(onBeforeNavigate.addListener).toHaveBeenCalledWith(listener);
    expect(onBeforeNavigate.removeListener).toHaveBeenCalledWith(listener);
  });
});
