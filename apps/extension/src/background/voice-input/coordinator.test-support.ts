import { beforeEach, vi } from 'vitest';
import {
  VOICE_INPUT_PORT_NAME,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { voiceInputCoordinatorMocks } from '../../../../../tooling/test/support/voice-input-coordinator.test-support';

export const mocks = voiceInputCoordinatorMocks;

vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: {
    getContexts: (filter: chrome.runtime.ContextFilter) => mocks.getRuntimeContexts(filter),
    subscribeToConnections: vi.fn(),
  },
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (message: object) => ({
    ...message,
    capabilityToken: 'capability',
  }),
}));

vi.mock('../mutation-exclusion/media-activity', async () => {
  const { voiceInputCoordinatorMocks: runtimeMocks } =
    await import('../../../../../tooling/test/support/voice-input-coordinator.test-support');
  return {
    acquireMediaMutationPermit: runtimeMocks.acquireMediaMutationPermit,
    getMediaAuthorityGeneration: vi.fn(),
    reserveMediaErasureExclusion: vi.fn(),
  };
});

vi.mock('../routing-contracts/runtime-messaging/services', async () => {
  const { voiceInputCoordinatorMocks: runtimeMocks } =
    await import('../../../../../tooling/test/support/voice-input-coordinator.test-support');
  return {
    getBackgroundRuntimeMessaging: () => ({
      sendRuntimeMessage: runtimeMocks.sendRuntimeMessage,
    }),
    resetBackgroundRuntimeMessagingForTests: vi.fn(),
    setBackgroundRuntimeMessagingForTests: vi.fn(),
  };
});

vi.mock('../offscreen-document/service', async () => {
  const { voiceInputCoordinatorMocks: runtimeMocks } =
    await import('../../../../../tooling/test/support/voice-input-coordinator.test-support');
  return {
    closeOffscreenDocumentForPrivacyErasure: vi.fn(),
    createOffscreenDocumentService: vi.fn(),
    ensureOffscreenDocument: runtimeMocks.ensureOffscreenDocument,
    ensurePrivacyErasureOffscreenDocument: vi.fn(),
    hasOffscreenDocument: vi.fn(),
    markOffscreenDocumentReady: vi.fn(),
    waitForOffscreenReady: runtimeMocks.waitForOffscreenReady,
  };
});

import { createVoiceInputCoordinator as createVoiceInputCoordinatorImplementation } from './coordinator';

let internalSessionSequence = 0;

export function createVoiceInputCoordinator(
  schedule: (callback: () => void, delayMs: number) => void = () => undefined
) {
  return createVoiceInputCoordinatorImplementation(
    undefined,
    () => `offscreen-session-${++internalSessionSequence}`,
    schedule
  );
}

export function createTab(id: number): chrome.tabs.Tab {
  return {
    active: true,
    autoDiscardable: true,
    discarded: false,
    frozen: false,
    groupId: -1,
    highlighted: true,
    id,
    incognito: false,
    index: 0,
    pinned: false,
    selected: true,
    windowId: 1,
  };
}

export function createPort(documentId: string, tab?: chrome.tabs.Tab) {
  return createRuntimePortFixture({
    name: VOICE_INPUT_PORT_NAME,
    sender: {
      documentId,
      ...(tab === undefined ? {} : { tab }),
      url: [
        'chrome-extension://extension-id/apps/extension/src/settings/index.html',
        '?section=voice-input',
      ].join(''),
    },
  });
}

export function createContentPort(documentId: string, tab = createTab(7)) {
  return createRuntimePortFixture({
    name: VOICE_INPUT_PORT_NAME,
    sender: {
      documentId,
      frameId: 0,
      tab,
      url: 'https://example.com/design-review',
    },
  });
}

export async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

export function createSnapshot(
  sessionId: string | null,
  phase: VoiceInputSnapshot['phase'] = 'listening'
): VoiceInputSnapshot {
  return {
    apiFlavor: 'standard',
    busyOwner: sessionId ? 'speech-recognition' : null,
    effectiveMode: sessionId ? 'browser-managed' : null,
    errorCode: null,
    fallbackReason: sessionId ? 'dictation-unavailable' : null,
    language: 'ru-RU',
    localAvailability: sessionId ? 'unavailable' : 'unknown',
    phase,
    quality: 'dictation',
    qualitySupported: true,
    requestedMode: 'local-first',
    sessionId,
  };
}

beforeEach(() => {
  internalSessionSequence = 0;
  vi.clearAllMocks();
  mocks.acquireMediaMutationPermit.mockReturnValue(vi.fn());
  mocks.ensureOffscreenDocument.mockResolvedValue(true);
  mocks.getRuntimeContexts.mockResolvedValue([
    {
      contextId: 'offscreen-context',
      contextType: 'OFFSCREEN_DOCUMENT',
      frameId: -1,
      incognito: false,
      tabId: -1,
      windowId: -1,
    },
  ]);
  mocks.waitForOffscreenReady.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true, result: 'accepted' });
});
