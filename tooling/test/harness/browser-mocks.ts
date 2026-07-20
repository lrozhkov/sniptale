/**
 * Browser API mocks for Playwright UI harness pages.
 * Load before extension UI entrypoints so they can render without a live Chrome runtime.
 */

import {
  ChromeEvent,
  clearStoredItems,
  getStoredItemsSnapshot,
  setStoredItems,
} from './browser-mocks.shared';
import { createChromeMock, emitOffscreenMessage, ensureMediaDevices } from './browser-mocks.chrome';
import {
  DEFAULT_ACTIVE_TAB,
  createHarnessApiBehavior,
  type HarnessActiveTab,
  type HarnessClipboardWrite,
  type HarnessCreatedTab,
  isRuntimeResponseOverrideHandler,
  type RuntimeResponseOverride,
  type SniptaleHarnessApiBehavior,
  type SniptaleHarnessApiBehaviorOverrides,
  type SniptaleHarnessBootstrap,
  type SniptaleHarnessBridge,
} from './browser-mocks.types';
import {
  clearHarnessMediaLibrary,
  listHarnessMediaLibraryAssets,
  seedHarnessMediaLibrary,
  seedHarnessMediaState,
} from './browser-mocks.media-library';
import { attachHarnessStorageArea } from './browser-mocks.storage';

const runtimeOnMessage = new ChromeEvent<[unknown, unknown?, ((response?: unknown) => void)?]>();
const tabsOnActivated = new ChromeEvent<[unknown]>();
const tabsOnUpdated = new ChromeEvent<[number, unknown, unknown]>();
const permissionsOnAdded = new ChromeEvent<[unknown]>();
const permissionsOnRemoved = new ChromeEvent<[unknown]>();

declare global {
  interface Window {
    __sniptaleHarness?: SniptaleHarnessBridge;
    __sniptaleHarnessBootstrap?: SniptaleHarnessBootstrap;
  }
}

const runtimeMessages: unknown[] = [];
const createdTabs: HarnessCreatedTab[] = [];
const clipboardWrites: HarnessClipboardWrite[] = [];
const runtimeResponseOverrides = new Map<string, RuntimeResponseOverride>();
let activeTab: HarnessActiveTab = { ...DEFAULT_ACTIVE_TAB };
let apiBehavior: SniptaleHarnessApiBehavior = createHarnessApiBehavior();

async function resetHarnessState() {
  runtimeMessages.length = 0;
  createdTabs.length = 0;
  clipboardWrites.length = 0;
  runtimeResponseOverrides.clear();
  activeTab = { ...DEFAULT_ACTIVE_TAB };
  apiBehavior = createHarnessApiBehavior();
  clearStoredItems();
  await clearHarnessMediaLibrary();
}

async function applyHarnessBootstrap(bootstrap?: SniptaleHarnessBootstrap) {
  if (!bootstrap) {
    return;
  }

  if (bootstrap.storage) {
    setStoredItems(bootstrap.storage);
  }

  if (bootstrap.runtimeResponses) {
    for (const [messageType, response] of Object.entries(bootstrap.runtimeResponses)) {
      runtimeResponseOverrides.set(messageType, response);
    }
  }

  apiBehavior = createHarnessApiBehavior(bootstrap.apiBehavior);

  if (bootstrap.activeTab) {
    activeTab = {
      ...activeTab,
      ...bootstrap.activeTab,
    };
  }

  await seedHarnessMediaState(bootstrap);
}

function getRuntimeMessageType(message: unknown): string | null {
  return typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof message.type === 'string'
    ? message.type
    : null;
}

function getKnownRuntimeResponse(message: unknown) {
  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'GET_RECORDING_STATE'
  ) {
    return {
      success: true,
      state: {
        status: 'IDLE',
        duration: 0,
        countdownEndsAt: null,
        captureMode: null,
        captureSource: null,
        viewportPreset: null,
        error: null,
      },
    };
  }

  return undefined;
}

function getDefaultRuntimeResponse(message: unknown) {
  const knownResponse = getKnownRuntimeResponse(message);
  if (knownResponse !== undefined) {
    return knownResponse;
  }

  if (apiBehavior.runtimeFallback === 'typed-success') {
    return { success: true };
  }

  const messageType = getRuntimeMessageType(message);
  throw new Error(
    messageType
      ? `No harness runtime response configured for ${messageType}`
      : 'No harness runtime response configured for untyped message'
  );
}

function applyApiBehaviorOverrides(overrides: SniptaleHarnessApiBehaviorOverrides) {
  apiBehavior = createHarnessApiBehavior(overrides, apiBehavior);
}

async function resolveRuntimeResponse(message: unknown): Promise<unknown> {
  runtimeMessages.push(message);

  const messageType = getRuntimeMessageType(message);
  const override = messageType ? runtimeResponseOverrides.get(messageType) : undefined;

  if (isRuntimeResponseOverrideHandler(override)) {
    return override(message);
  }

  if (override !== undefined) {
    return override;
  }

  return getDefaultRuntimeResponse(message);
}

async function createHarnessTab(
  createProperties: chrome.tabs.CreateProperties
): Promise<chrome.tabs.Tab> {
  const nextTab = {
    id: createdTabs.length + 2,
    url: createProperties.url ?? '',
  };
  createdTabs.push(nextTab);
  return nextTab as chrome.tabs.Tab;
}

function ensureClipboardItem() {
  if (typeof window.ClipboardItem !== 'undefined') {
    return;
  }

  class MockClipboardItem {
    constructor(public readonly items: Record<string, Blob>) {}

    static supports(): boolean {
      return true;
    }
  }

  window.ClipboardItem = MockClipboardItem as unknown as typeof ClipboardItem;
}

function ensureClipboardMock() {
  const clipboard = {
    write: async (items: ClipboardItem[]) => {
      const types = items.flatMap((item) => item.types);
      clipboardWrites.push({
        itemCount: items.length,
        types,
      });
    },
  };

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });
}

function ensureWindowClose() {
  window.close = () => undefined;
}

function installChromeMock(chromeMock: ReturnType<typeof createChromeMock>) {
  const existingChrome = (window as typeof window & { chrome?: typeof chrome }).chrome;
  if (!existingChrome) {
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: chromeMock as unknown as typeof chrome,
    });
    return;
  }

  for (const [key, value] of Object.entries(chromeMock)) {
    Object.defineProperty(existingChrome, key, {
      configurable: true,
      value,
    });
  }
}

function ensureChromeMock() {
  const existingChrome = (window as typeof window & { chrome?: typeof chrome }).chrome;
  if (existingChrome?.runtime?.id && typeof existingChrome.runtime.getManifest === 'function') {
    return;
  }

  const chromeMock = createChromeMock({
    runtimeOnMessage,
    tabsOnActivated,
    tabsOnUpdated,
    permissionsOnAdded,
    permissionsOnRemoved,
    controller: {
      getActiveTab: () => activeTab,
      handleRuntimeSendMessage: resolveRuntimeResponse,
      handleTabCreate: createHarnessTab,
    },
    getBehavior: () => apiBehavior,
  });

  attachHarnessStorageArea(chromeMock.storage.local, 'local', chromeMock.storage.onChanged);
  attachHarnessStorageArea(chromeMock.storage.sync, 'sync', chromeMock.storage.onChanged);

  installChromeMock(chromeMock);
}

ensureClipboardItem();
ensureClipboardMock();
ensureMediaDevices(() => apiBehavior);
ensureWindowClose();
ensureChromeMock();

export const harnessReady = (async () => {
  await resetHarnessState();
  await applyHarnessBootstrap(window.__sniptaleHarnessBootstrap);
})();

window.__sniptaleHarness = {
  reset: resetHarnessState,
  seedStorage: (items) => {
    setStoredItems(items);
  },
  seedMediaLibrary: seedHarnessMediaLibrary,
  getStorageState: () => getStoredItemsSnapshot(),
  getMediaLibraryState: () => listHarnessMediaLibraryAssets(),
  getRuntimeMessages: () => [...runtimeMessages],
  emitRuntimeMessage: (message) => {
    runtimeOnMessage.emit(message, undefined, () => undefined);
  },
  emitTrustedOffscreenRuntimeMessage: (message) => emitOffscreenMessage(runtimeOnMessage, message),
  getCreatedTabs: () => [...createdTabs],
  getClipboardWrites: () => [...clipboardWrites],
  setRuntimeResponse: (messageType, response) => {
    runtimeResponseOverrides.set(messageType, response);
  },
  clearRuntimeResponses: () => {
    runtimeResponseOverrides.clear();
  },
  setApiBehavior: (behavior) => {
    applyApiBehaviorOverrides(behavior);
  },
  resetApiBehavior: () => {
    apiBehavior = createHarnessApiBehavior();
  },
  setActiveTab: (tab) => {
    activeTab = { ...activeTab, ...tab };
  },
};
