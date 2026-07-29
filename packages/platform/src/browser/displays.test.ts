import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserDisplays } from './displays';

const getInfo = vi.fn();

beforeEach(() => {
  installChromeGlobal({ system: { display: { getInfo } } });
  getInfo.mockReset();
});

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

describe('browser displays adapter', () => {
  it('returns display metadata through the owned adapter', async () => {
    const displays = [{ id: 'display-1', isPrimary: true }];
    getInfo.mockResolvedValue(displays);
    await expect(browserDisplays.getInfo()).resolves.toBe(displays);
  });

  it('fails when the display API is unavailable', async () => {
    installChromeGlobal({});
    await expect(browserDisplays.getInfo()).rejects.toThrow(
      'chrome.system.display.getInfo is unavailable'
    );
  });
});
