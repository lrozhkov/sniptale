import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserStorageStateDomainAdapter,
  type BrowserStorageAreaPort,
} from './browser-storage-state-domain-adapter';

function createStorageArea() {
  return {
    clear: vi.fn((callback: () => void) => callback()),
    get: vi.fn((keys: unknown, callback: (value: Record<string, unknown>) => void) => {
      callback(keys === null ? { first: 1 } : { first: 1, keys });
    }),
    remove: vi.fn((_keys: unknown, callback: () => void) => callback()),
    set: vi.fn((_items: unknown, callback: () => void) => callback()),
  } satisfies BrowserStorageAreaPort;
}

function installChromeRuntime() {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: { runtime: { lastError: undefined } },
    writable: true,
  });
}

describe('browser storage state domain adapter', () => {
  beforeEach(() => {
    installChromeRuntime();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'chrome');
  });

  it('hydrates and reads through chrome storage callbacks', async () => {
    const area = createStorageArea();
    const adapter = createBrowserStorageStateDomainAdapter('local', () => area);

    await expect(adapter.hydrate?.()).resolves.toEqual({ first: 1 });
    await expect(adapter.read?.('first')).resolves.toBe(1);
  });

  it('writes and removes batches through single chrome storage calls', async () => {
    const area = createStorageArea();
    const adapter = createBrowserStorageStateDomainAdapter('local', () => area);

    await adapter.writeMany?.({ first: 1, second: 2 });
    await adapter.removeMany?.(['first', 'second']);

    expect(area.set).toHaveBeenCalledWith({ first: 1, second: 2 }, expect.any(Function));
    expect(area.remove).toHaveBeenCalledWith(['first', 'second'], expect.any(Function));
  });

  it('rejects when the storage area is unavailable', async () => {
    const adapter = createBrowserStorageStateDomainAdapter('local', () => null);

    await expect(adapter.hydrate?.()).rejects.toThrow('chrome.storage.local is unavailable');
  });
});
