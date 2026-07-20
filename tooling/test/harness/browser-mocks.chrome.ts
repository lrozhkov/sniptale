import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import {
  type HarnessActiveTab,
  type SniptaleHarnessApiBehavior,
  DEFAULT_HARNESS_API_BEHAVIOR,
} from './browser-mocks.types';
import { createHarnessStorageMock } from './browser-mocks.storage';

type ChromeMockController = {
  getActiveTab: () => HarnessActiveTab;
  handleRuntimeSendMessage: (message: unknown) => Promise<unknown>;
  handleTabCreate: (createProperties: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>;
};

export function emitOffscreenMessage(
  runtimeOnMessage: typeof chrome.runtime.onMessage,
  message: unknown
): void {
  const extensionId = chrome.runtime.id;
  runtimeOnMessage.emit(
    attachRuntimeMessageFreshness(attachOffscreenCommandCapability(message)),
    {
      id: extensionId,
      url: `chrome-extension://${extensionId}/service-worker-loader.js`,
    },
    () => undefined
  );
}

function createMockMediaTrack(): MediaStreamTrack {
  return {
    stop() {},
    enabled: true,
    kind: 'audio',
    label: 'Mock microphone',
    id: 'mock-track',
    readyState: 'live',
    muted: false,
    onended: null,
    onmute: null,
    onunmute: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    clone() {
      return this;
    },
    getCapabilities() {
      return {};
    },
    getConstraints() {
      return {};
    },
    getSettings() {
      return {};
    },
    applyConstraints() {
      return Promise.resolve();
    },
  } as unknown as MediaStreamTrack;
}

function createMockMediaStream(): MediaStream {
  const track = createMockMediaTrack();

  return {
    id: 'mock-stream',
    active: true,
    onaddtrack: null,
    onremovetrack: null,
    addTrack() {},
    removeTrack() {},
    clone() {
      return createMockMediaStream();
    },
    getAudioTracks() {
      return [track];
    },
    getTracks() {
      return [track];
    },
    getTrackById(id: string) {
      return id === track.id ? track : null;
    },
    getVideoTracks() {
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  } as unknown as MediaStream;
}

function createEnumerateDevices(): MediaDevices['enumerateDevices'] {
  return async () =>
    [
      {
        deviceId: 'mock-mic',
        kind: 'audioinput',
        label: 'Mock microphone',
        groupId: 'mock-group',
        toJSON() {
          return this;
        },
      },
    ] as MediaDeviceInfo[];
}

function createMediaDeviceEventHandlers(
  listeners: Map<string, Set<EventListenerOrEventListenerObject>>
): Pick<MediaDevices & EventTarget, 'addEventListener' | 'removeEventListener'> {
  return {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (!listener) {
        return;
      }

      const bucket = listeners.get(type) ?? new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (!listener) {
        return;
      }

      listeners.get(type)?.delete(listener);
    },
  };
}

function createPermissionDeniedError(): DOMException {
  return new DOMException('Harness microphone permission denied', 'NotAllowedError');
}

export function ensureMediaDevices(
  getBehavior: () => SniptaleHarnessApiBehavior = () => DEFAULT_HARNESS_API_BEHAVIOR
): void {
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {},
    });
  }

  const mediaDevices = navigator.mediaDevices as MediaDevices & EventTarget;
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const eventHandlers = createMediaDeviceEventHandlers(listeners);

  if (!mediaDevices.enumerateDevices) {
    mediaDevices.enumerateDevices = createEnumerateDevices();
  }

  if (!mediaDevices.getUserMedia) {
    mediaDevices.getUserMedia = async () => {
      if (getBehavior().mediaDevices.getUserMedia === 'success') {
        return createMockMediaStream();
      }

      throw createPermissionDeniedError();
    };
  }

  if (!mediaDevices.addEventListener) {
    mediaDevices.addEventListener = eventHandlers.addEventListener;
  }

  if (!mediaDevices.removeEventListener) {
    mediaDevices.removeEventListener = eventHandlers.removeEventListener;
  }
}

function createHarnessManifest() {
  return {
    manifest_version: 3,
    name: `${PRODUCT_BRAND_NAME} Harness`,
    version: '0.0.0-test',
    action: {
      default_popup: 'apps/extension/src/popup/index.html',
      default_title: `Open ${PRODUCT_BRAND_NAME}`,
    },
    homepage_url: 'https://example.com/support',
  };
}

function createRuntimeMock(
  runtimeOnMessage: typeof chrome.runtime.onMessage,
  controller: ChromeMockController
) {
  return {
    id: 'playwright-ui-harness',
    lastError: null,
    getManifest: () => createHarnessManifest(),
    getURL: (path: string) => new URL(path, window.location.origin + '/').toString(),
    onMessage: runtimeOnMessage,
    sendMessage: (message?: unknown) => controller.handleRuntimeSendMessage(message),
  };
}

function createTabsMock(
  tabsOnActivated: typeof chrome.tabs.onActivated,
  tabsOnUpdated: typeof chrome.tabs.onUpdated,
  controller: ChromeMockController,
  getBehavior: () => SniptaleHarnessApiBehavior
) {
  return {
    query: async () => [controller.getActiveTab()],
    create: (createProperties: chrome.tabs.CreateProperties) =>
      controller.handleTabCreate(createProperties),
    sendMessage: async (_tabId: number, _message?: unknown) => {
      if (getBehavior().tabSendMessage === 'success') {
        return { success: true };
      }

      throw new Error('No harness tab response configured');
    },
    onActivated: tabsOnActivated,
    onUpdated: tabsOnUpdated,
  };
}

function createPermissionsMock(
  permissionsOnAdded: typeof chrome.permissions.onAdded,
  permissionsOnRemoved: typeof chrome.permissions.onRemoved,
  getBehavior: () => SniptaleHarnessApiBehavior
) {
  return {
    contains: (_options: unknown, callback?: (granted: boolean) => void) => {
      const granted = getBehavior().permissions.contains;
      callback?.(granted);
      return Promise.resolve(granted);
    },
    request: (_options: unknown, callback?: (granted: boolean) => void) => {
      const granted = getBehavior().permissions.request;
      callback?.(granted);
      return Promise.resolve(granted);
    },
    onAdded: permissionsOnAdded,
    onRemoved: permissionsOnRemoved,
  };
}

export function createChromeMock(dependencies: {
  runtimeOnMessage: typeof chrome.runtime.onMessage;
  tabsOnActivated: typeof chrome.tabs.onActivated;
  tabsOnUpdated: typeof chrome.tabs.onUpdated;
  permissionsOnAdded: typeof chrome.permissions.onAdded;
  permissionsOnRemoved: typeof chrome.permissions.onRemoved;
  controller: ChromeMockController;
  getBehavior?: () => SniptaleHarnessApiBehavior;
}) {
  const getBehavior = dependencies.getBehavior ?? (() => DEFAULT_HARNESS_API_BEHAVIOR);

  return {
    runtime: createRuntimeMock(dependencies.runtimeOnMessage, dependencies.controller),
    tabs: createTabsMock(
      dependencies.tabsOnActivated,
      dependencies.tabsOnUpdated,
      dependencies.controller,
      getBehavior
    ),
    storage: createHarnessStorageMock(),
    permissions: createPermissionsMock(
      dependencies.permissionsOnAdded,
      dependencies.permissionsOnRemoved,
      getBehavior
    ),
    downloads: {},
  };
}
