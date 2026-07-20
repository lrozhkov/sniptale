import { vi } from 'vitest';

function createListenerStub() {
  return { addListener: vi.fn(), removeListener: vi.fn() };
}

function createStorageAreaStub() {
  return { get: vi.fn(), remove: vi.fn(), set: vi.fn() };
}

function createChromeStubRuntime() {
  return {
    connect: vi.fn(),
    getPlatformInfo: vi.fn(),
    getContexts: vi.fn(),
    getManifest: vi.fn(() => ({ name: 'Sniptale', version: '0.0.0-test' })),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    lastError: undefined as { message?: string } | undefined,
    onConnect: createListenerStub(),
    onInstalled: createListenerStub(),
    onMessage: createListenerStub(),
  };
}

function createChromeStubStorage() {
  return {
    local: createStorageAreaStub(),
    onChanged: createListenerStub(),
    session: createStorageAreaStub(),
    sync: createStorageAreaStub(),
  };
}

function createChromeStubDownloads() {
  return {
    download: vi.fn(),
    onChanged: createListenerStub(),
    search: vi.fn(),
  };
}

function createChromeStubDebugger() {
  return {
    attach: vi.fn(),
    detach: vi.fn(),
    getTargets: vi.fn(),
    onDetach: createListenerStub(),
    onEvent: createListenerStub(),
    sendCommand: vi.fn(),
  };
}

function createChromeStubOffscreen() {
  return { closeDocument: vi.fn(), createDocument: vi.fn() };
}

function createChromeStubPermissions() {
  return {
    contains: vi.fn(),
    onAdded: createListenerStub(),
    onRemoved: createListenerStub(),
    remove: vi.fn(),
    request: vi.fn(),
  };
}

function createChromeStubTabCapture() {
  return { getMediaStreamId: vi.fn() };
}

type ChromeStubWithContextMenus = ReturnType<typeof createChromeStub> & {
  contextMenus: {
    create: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    removeAll: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    onClicked: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
    onShown: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
  };
};

export function createChromeStub() {
  return {
    debugger: createChromeStubDebugger(),
    downloads: createChromeStubDownloads(),
    offscreen: createChromeStubOffscreen(),
    permissions: createChromeStubPermissions(),
    runtime: createChromeStubRuntime(),
    storage: createChromeStubStorage(),
    tabCapture: createChromeStubTabCapture(),
  };
}

export function createChromeStubWithContextMenus(): ChromeStubWithContextMenus {
  const chromeStub = createChromeStub() as ChromeStubWithContextMenus;
  chromeStub.contextMenus = {
    create: vi.fn((_options: unknown, callback?: () => void) => {
      callback?.();
      return 'menu-id';
    }),
    refresh: vi.fn((callback: () => void) => callback()),
    removeAll: vi.fn((callback: () => void) => callback()),
    update: vi.fn((_id: string, _options: unknown, callback: () => void) => callback()),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
    onShown: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  return chromeStub;
}
