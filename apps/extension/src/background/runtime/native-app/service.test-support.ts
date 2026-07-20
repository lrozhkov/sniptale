import { vi } from 'vitest';

import type {
  AppControllerLeaseMessage,
  AppHelloMessage,
  ExtensionSettingsSyncMessage,
} from '../../../contracts/native-app';
import { createChromeStorageArea } from './service-storage.test-support';
import * as mutationBarrier from '../../../composition/persistence/infrastructure/mutation-barrier';

type NativePortMessageListener = (message: unknown, port: chrome.runtime.Port) => void;
type NativePortDisconnectListener = (port: chrome.runtime.Port) => void;

export type NativeTestPort = chrome.runtime.Port & {
  emitDisconnect(): void;
  emitMessage(message: unknown): void;
  postMessage: ReturnType<typeof vi.fn<(message: unknown) => void>>;
};

function createNativeMessageEvent() {
  const listeners = new Set<NativePortMessageListener>();
  return {
    event: {
      addListener: (listener) => listeners.add(listener),
      addRules: vi.fn(),
      getRules: vi.fn(),
      hasListener: (listener) => listeners.has(listener),
      hasListeners: () => listeners.size > 0,
      removeListener: (listener) => listeners.delete(listener),
      removeRules: vi.fn(),
    } as chrome.events.Event<NativePortMessageListener>,
    listeners,
  };
}

function createNativeDisconnectEvent() {
  const listeners = new Set<NativePortDisconnectListener>();
  return {
    event: {
      addListener: (listener) => listeners.add(listener),
      addRules: vi.fn(),
      getRules: vi.fn(),
      hasListener: (listener) => listeners.has(listener),
      hasListeners: () => listeners.size > 0,
      removeListener: (listener) => listeners.delete(listener),
      removeRules: vi.fn(),
    } as chrome.events.Event<NativePortDisconnectListener>,
    listeners,
  };
}

export function createNativeTestPort(): NativeTestPort {
  const messages = createNativeMessageEvent();
  const disconnects = createNativeDisconnectEvent();
  const port: NativeTestPort = {
    disconnect: vi.fn(),
    emitDisconnect() {
      disconnects.listeners.forEach((listener) => listener(port));
    },
    emitMessage(message: unknown) {
      messages.listeners.forEach((listener) => listener(message, port));
    },
    name: 'sniptale-native-test',
    onDisconnect: disconnects.event,
    onMessage: messages.event,
    postMessage: vi.fn<(message: unknown) => void>(),
  };
  return port;
}

export function createNativeConnect(port: chrome.runtime.Port) {
  return vi.fn<() => chrome.runtime.Port>(() => port);
}

export function createNativeInstallState(): AppHelloMessage['install'] {
  return {
    appCacheSchemaVersion: 1,
    appVersion: '0.1.0',
    autostart: { enabled: true, method: 'windows-hkcu-run', supported: true },
    installerVersion: '0.1.0',
    nativeHostManifestVersion: '0.1.0',
    packageIntegrity: 'valid',
    platform: { arch: 'x64', kind: 'windows', version: '11' },
    rollbackProtected: true,
    signedBinary: true,
    updateChannel: 'stable',
  };
}

function createNativeCapabilities(): AppHelloMessage['capabilities'] {
  return {
    audio: {
      microphoneDevices: [],
      supportsMicrophone: true,
      supportsMixedAudio: true,
      supportsSystemAudio: true,
      unavailableReasons: [],
    },
    capture: {
      screenshotModes: ['screen', 'active-window', 'all-screens', 'region'],
      supportsFreezeRegionSelection: true,
      videoModes: ['screen', 'active-window', 'region'],
    },
    codecs: {
      audio: ['aac'],
      containers: ['mp4'],
      hardwareEncoderAvailable: true,
      unavailableReasons: [],
      video: ['h264'],
    },
    limits: {
      maxChunkBytes: 524288,
      maxFps: 60,
      maxHeight: 2160,
      maxRecordingBytes: 1024 * 1024 * 1024,
      maxScreenshotBytes: 1024 * 1024,
      maxWidth: 3840,
    },
  };
}

export function createNativeHello(patch: Partial<AppHelloMessage> = {}): AppHelloMessage {
  return {
    appInstanceId: 'app-1',
    capabilities: createNativeCapabilities(),
    install: createNativeInstallState(),
    minExtensionVersion: '0.1.0',
    platform: { arch: 'x64', kind: 'windows', version: '11' },
    protocolVersion: 1,
    settingsSchemaVersion: 1,
    supportedProtocolVersions: [1],
    supportedSettingsSchemaVersions: [1],
    type: 'app.hello',
    ...patch,
  };
}

export function createNativeLease(
  patch: Partial<AppControllerLeaseMessage> = {}
): AppControllerLeaseMessage {
  return {
    controller: {
      browserFamily: 'chrome',
      connectionId: 'conn-1',
      extensionId: 'extension-id',
      profileKey: 'profile-1',
    },
    controllerLeaseId: 'lease-1',
    expiresAtEpochMs: Date.now() + 60_000,
    protocolVersion: 1,
    status: 'granted',
    type: 'app.controller.lease',
    ...patch,
  };
}

export function installChromeRuntimeInfo(): void {
  mutationBarrier.installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation(),
  });
  const storageValues: Record<string, unknown> = {};
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        getManifest: () => ({ name: 'Sniptale', version: '0.1.0', version_name: '0.1.0' }),
        id: 'extension-id',
        lastError: undefined,
      },
      storage: {
        local: createChromeStorageArea(storageValues),
        onChanged: {
          addListener: vi.fn(),
          addRules: vi.fn(),
          getRules: vi.fn(),
          hasListener: vi.fn(() => false),
          hasListeners: vi.fn(() => false),
          removeListener: vi.fn(),
          removeRules: vi.fn(),
        },
        session: createChromeStorageArea({}),
        sync: createChromeStorageArea({}),
      },
    },
  });
}

export async function flushNativeServiceAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function waitForNativePost(
  port: NativeTestPort,
  type: string,
  count = 1
): Promise<unknown> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const matches = port.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => hasNativeMessageType(message, type));
    if (matches.length >= count) {
      return matches[count - 1];
    }
    await flushNativeServiceAsync();
  }
  throw new Error(`Expected ${count} native message(s): ${type}`);
}

export async function waitForNativeSettingsSync(
  port: NativeTestPort,
  count = 1
): Promise<ExtensionSettingsSyncMessage> {
  const message = await waitForNativePost(port, 'extension.settings.sync', count);
  if (!isNativeSettingsSyncMessage(message)) {
    throw new Error('Expected native settings sync message');
  }
  return message;
}

function hasNativeMessageType(message: unknown, type: string): boolean {
  return (
    typeof message === 'object' && message !== null && 'type' in message && message.type === type
  );
}

function isNativeSettingsSyncMessage(message: unknown): message is ExtensionSettingsSyncMessage {
  return hasNativeMessageType(message, 'extension.settings.sync');
}
