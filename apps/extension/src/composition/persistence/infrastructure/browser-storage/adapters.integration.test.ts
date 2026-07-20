import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserContextMenus } from '@sniptale/platform/browser/context-menus';
import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { browserDownloads } from '@sniptale/platform/browser/downloads';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { browserStorage } from '../browser-storage';
import { browserWindows } from '@sniptale/platform/browser/windows';
import {
  createChromeStub,
  createChromeStubWithContextMenus,
} from '@sniptale/platform/browser/test-fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function expectContextMenuOperationsToSucceed() {
  await expect(
    browserContextMenus.create({
      id: 'menu-id',
      title: 'Menu',
    } as chrome.contextMenus.CreateProperties)
  ).resolves.toBe('menu-id');
  await expect(browserContextMenus.update('menu-id', { enabled: false })).resolves.toBeUndefined();
  await expect(browserContextMenus.removeAll()).resolves.toBeUndefined();
  await expect(browserContextMenus.refresh()).resolves.toBeUndefined();
}

function expectContextMenuListeners(args: {
  chromeStub: ReturnType<typeof createChromeStubWithContextMenus>;
  clickedListener: ReturnType<typeof vi.fn>;
  shownListener: ReturnType<typeof vi.fn>;
}) {
  expect(args.chromeStub.contextMenus.onClicked.addListener).toHaveBeenCalledWith(
    args.clickedListener
  );
  expect(args.chromeStub.contextMenus.onClicked.removeListener).toHaveBeenCalledWith(
    args.clickedListener
  );
  expect(args.chromeStub.contextMenus.onShown.addListener).toHaveBeenCalledWith(args.shownListener);
  expect(args.chromeStub.contextMenus.onShown.removeListener).toHaveBeenCalledWith(
    args.shownListener
  );
}
describe('browser storage adapters', () => {
  it('normalizes storage callback reads into promises', async () => {
    const chromeStub = createChromeStub();
    chromeStub.storage.local.get.mockImplementation(
      (_keys: unknown, callback: (value: unknown) => void) => callback({ demo: 42 })
    );
    vi.stubGlobal('chrome', chromeStub);

    await expect(browserStorage.local.get(['demo'])).resolves.toEqual({ demo: 42 });
  });

  it('returns deterministic unsubscribe for storage listeners', () => {
    const chromeStub = createChromeStub();
    vi.stubGlobal('chrome', chromeStub);

    const listener = vi.fn();
    const unsubscribe = browserStorage.subscribeToChanges(listener);
    unsubscribe();

    expect(chromeStub.storage.onChanged.addListener).toHaveBeenCalledWith(listener);
    expect(chromeStub.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
  });
});
describe('browser downloads adapters', () => {
  it('rejects download calls when chrome reports lastError', async () => {
    const chromeStub = createChromeStub();
    chromeStub.downloads.download.mockImplementation(
      (_options: unknown, callback: (value: number | undefined) => void) => {
        chromeStub.runtime.lastError = { message: 'blocked' };
        callback(undefined);
        chromeStub.runtime.lastError = undefined;
      }
    );
    vi.stubGlobal('chrome', chromeStub);

    await expect(
      browserDownloads.download({ url: 'https://example.com', filename: 'a.txt' })
    ).rejects.toEqual(expect.objectContaining({ message: 'blocked' }));
  });
});
describe('browser permissions adapters', () => {
  it('normalizes permission callbacks and listener unsubscribe', async () => {
    const chromeStub = createChromeStub();
    chromeStub.permissions.request.mockImplementation(
      (_permissions: unknown, callback: (granted: boolean) => void) => callback(true)
    );
    chromeStub.permissions.contains.mockImplementation(
      (_permissions: unknown, callback: (granted: boolean) => void) => callback(true)
    );
    chromeStub.permissions.remove.mockImplementation(
      (_permissions: unknown, callback: (removed: boolean) => void) => callback(true)
    );
    vi.stubGlobal('chrome', chromeStub);

    const addedListener = vi.fn();
    const removedListener = vi.fn();
    const unsubscribeAdded = browserPermissions.subscribeToAdded(addedListener);
    const unsubscribeRemoved = browserPermissions.subscribeToRemoved(removedListener);

    await expect(browserPermissions.request({ permissions: ['downloads'] })).resolves.toBe(true);
    await expect(browserPermissions.contains({ origins: ['<all_urls>'] })).resolves.toBe(true);
    await expect(browserPermissions.remove({ origins: ['https://example.test/*'] })).resolves.toBe(
      true
    );

    unsubscribeAdded();
    unsubscribeRemoved();

    expect(chromeStub.permissions.onAdded.addListener).toHaveBeenCalledWith(addedListener);
    expect(chromeStub.permissions.onAdded.removeListener).toHaveBeenCalledWith(addedListener);
    expect(chromeStub.permissions.onRemoved.addListener).toHaveBeenCalledWith(removedListener);
    expect(chromeStub.permissions.onRemoved.removeListener).toHaveBeenCalledWith(removedListener);
    expect(chromeStub.permissions.remove).toHaveBeenCalledWith(
      { origins: ['https://example.test/*'] },
      expect.any(Function)
    );
  });
});
describe('browser debugger/runtime adapters', () => {
  it('normalizes debugger attach callbacks and listener unsubscribe', async () => {
    const chromeStub = createChromeStub();
    chromeStub.debugger.attach.mockImplementation(
      (_target: unknown, _version: string, callback: () => void) => callback()
    );
    vi.stubGlobal('chrome', chromeStub);

    const listener = vi.fn();
    const unsubscribe = browserDebugger.subscribeToEvent(listener);

    await expect(browserDebugger.attach({ tabId: 1 }, '1.3')).resolves.toBeUndefined();

    unsubscribe();
    expect(chromeStub.debugger.onEvent.addListener).toHaveBeenCalledWith(listener);
    expect(chromeStub.debugger.onEvent.removeListener).toHaveBeenCalledWith(listener);
  });

  it('returns deterministic unsubscribe for runtime message listeners', () => {
    const chromeStub = createChromeStub();
    vi.stubGlobal('chrome', chromeStub);

    const listener = vi.fn();
    const unsubscribe = browserRuntime.subscribeToMessages(listener);
    unsubscribe();

    expect(chromeStub.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
    expect(chromeStub.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
  });
});

describe('browser windows adapters', () => {
  it('normalizes window update calls and unavailable chrome windows APIs', async () => {
    const chromeStub = {
      ...createChromeStub(),
      windows: { update: vi.fn() },
    };
    chromeStub.windows.update.mockResolvedValue({ id: 9 } as chrome.windows.Window);
    vi.stubGlobal('chrome', chromeStub);

    await expect(browserWindows.update(9, { focused: true })).resolves.toEqual({ id: 9 });
    expect(chromeStub.windows.update).toHaveBeenCalledWith(9, { focused: true });

    vi.unstubAllGlobals();
    await expect(browserWindows.update(9, { focused: true })).rejects.toThrow(
      'chrome.windows.update is unavailable'
    );
  });
});

describe('browser runtime connection adapter', () => {
  it('returns deterministic unsubscribe for runtime connection listeners', () => {
    const chromeStub = createChromeStub();
    vi.stubGlobal('chrome', chromeStub);

    const listener = vi.fn();
    const unsubscribe = browserRuntime.subscribeToConnections(listener);
    unsubscribe();

    expect(chromeStub.runtime.onConnect.addListener).toHaveBeenCalledWith(listener);
    expect(chromeStub.runtime.onConnect.removeListener).toHaveBeenCalledWith(listener);
  });
});

describe('browser runtime metadata adapter', () => {
  it('exposes runtime metadata helpers for manifest, URLs, errors, contexts, and platform info', async () => {
    const chromeStub = createChromeStub();
    chromeStub.runtime.getPlatformInfo.mockImplementation((callback: (value: unknown) => void) =>
      callback({ arch: 'x86-64', nacl_arch: 'x86-64', os: 'linux' })
    );
    chromeStub.runtime.getContexts.mockResolvedValue([{ contextId: 'ctx-1' }]);
    vi.stubGlobal('chrome', chromeStub);

    await expect(browserRuntime.getPlatformInfo()).resolves.toEqual({
      arch: 'x86-64',
      nacl_arch: 'x86-64',
      os: 'linux',
    });
    chromeStub.runtime.lastError = { message: 'runtime-error' };
    expect(browserRuntime.getManifest()).toEqual({ name: 'Sniptale', version: '0.0.0-test' });
    expect(browserRuntime.getURL('apps/extension/src/settings/index.html')).toBe(
      'chrome-extension://test/apps/extension/src/settings/index.html'
    );
    expect(browserRuntime.getLastError()).toEqual({ message: 'runtime-error' });
    const contextFilter = {
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    } satisfies chrome.runtime.ContextFilter;
    await expect(browserRuntime.getContexts(contextFilter)).resolves.toEqual([
      { contextId: 'ctx-1' },
    ]);
  });
});

describe('browser context menu adapters', () => {
  it('normalizes context menu callback APIs and listener unsubscribe', async () => {
    const chromeStub = createChromeStubWithContextMenus();
    vi.stubGlobal('chrome', chromeStub);

    const clickedListener = vi.fn();
    const shownListener = vi.fn();
    const unsubscribeClicked = browserContextMenus.subscribeToClicked(clickedListener);
    const unsubscribeShown = browserContextMenus.subscribeToShown(shownListener);
    await expectContextMenuOperationsToSucceed();

    unsubscribeClicked();
    unsubscribeShown();
    expectContextMenuListeners({ chromeStub, clickedListener, shownListener });
  });

  it('rejects context menu creation when chrome reports lastError in the callback', async () => {
    const chromeStub = createChromeStubWithContextMenus();
    chromeStub.contextMenus.create.mockImplementation((_props: unknown, callback: () => void) => {
      queueMicrotask(() => {
        chromeStub.runtime.lastError = { message: 'create failed' };
        callback();
        chromeStub.runtime.lastError = undefined;
      });
      return 'menu-id';
    });
    vi.stubGlobal('chrome', chromeStub);

    await expect(
      browserContextMenus.create({ id: 'menu-id' } as chrome.contextMenus.CreateProperties)
    ).rejects.toThrow('create failed');
  });
});

describe('browser context menu adapter availability', () => {
  it('rejects context menu mutations when chrome.contextMenus is unavailable', async () => {
    vi.unstubAllGlobals();

    expect(browserContextMenus.isAvailable()).toBe(false);
    await expect(
      browserContextMenus.create({ id: 'menu-id' } as chrome.contextMenus.CreateProperties)
    ).rejects.toThrow('chrome.contextMenus is unavailable');
    await expect(browserContextMenus.update('menu-id', { enabled: false })).rejects.toThrow(
      'chrome.contextMenus is unavailable'
    );
    await expect(browserContextMenus.removeAll()).rejects.toThrow(
      'chrome.contextMenus is unavailable'
    );
    await expect(browserContextMenus.refresh()).rejects.toThrow(
      'chrome.contextMenus is unavailable'
    );
  });

  it('treats missing shown and refresh handlers as unavailable optional capabilities', async () => {
    const chromeStub = createChromeStubWithContextMenus();
    const contextMenus = chromeStub.contextMenus as typeof chromeStub.contextMenus & {
      onShown?: typeof chromeStub.contextMenus.onShown;
      refresh?: typeof chromeStub.contextMenus.refresh;
    };
    Reflect.deleteProperty(contextMenus, 'refresh');
    Reflect.deleteProperty(contextMenus, 'onShown');
    vi.stubGlobal('chrome', chromeStub);

    const unsubscribeShown = browserContextMenus.subscribeToShown(vi.fn());
    unsubscribeShown();

    expect(browserContextMenus.isAvailable()).toBe(true);
    await expect(browserContextMenus.refresh()).rejects.toThrow(
      'chrome.contextMenus is unavailable'
    );
  });
});
