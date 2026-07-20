import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserNativeMessaging } from './native-messaging';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'chrome');
});

describe('browser native messaging adapter', () => {
  it('wraps chrome.runtime.connectNative only', () => {
    const port = { name: 'native-port' } as chrome.runtime.Port;
    const connectNative = vi.fn(() => port);
    Object.assign(globalThis, { chrome: { runtime: { connectNative } } });

    expect(browserNativeMessaging.connectNative('com.sniptale.native_host')).toBe(port);
    expect(connectNative).toHaveBeenCalledWith('com.sniptale.native_host');
  });
});
