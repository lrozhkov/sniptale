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
  it.each([
    ['subscribeToBeforeNavigate', 'onBeforeNavigate'],
    ['subscribeToCommitted', 'onCommitted'],
    ['subscribeToCompleted', 'onCompleted'],
    ['subscribeToErrorOccurred', 'onErrorOccurred'],
  ] as const)('returns deterministic unsubscribe for %s listeners', (method, eventName) => {
    const event = {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    installChromeGlobal({ webNavigation: { [eventName]: event } });

    const listener = vi.fn();
    const unsubscribe = browserWebNavigation[method](listener);
    unsubscribe();

    expect(event.addListener).toHaveBeenCalledWith(listener);
    expect(event.removeListener).toHaveBeenCalledWith(listener);
  });
});
