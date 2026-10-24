import { beforeEach, vi } from 'vitest';
import {
  VOICE_INPUT_PORT_NAME,
  VoiceInputPortMessageType,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
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

const runtimeDependencies = vi.hoisted(() => ({
  initialize: vi.fn(),
  beginCapture: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  run: vi.fn(),
  loadPreferences: vi.fn(),
}));
vi.mock('../../composition/persistence/voice-input-history', () => ({
  createVoiceInputHistory: () => runtimeDependencies,
}));
vi.mock('../../composition/persistence/settings', () => ({
  loadSettings: async () => ({ voiceInput: await runtimeDependencies.loadPreferences() }),
}));
vi.mock('./processing', () => ({
  createVoiceInputProcessor: () => ({ run: runtimeDependencies.run }),
  getVoiceInputProcessingErrorCode: () => 'provider-failed',
}));

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
    lastAccessed: 0,
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
  runtimeDependencies.initialize.mockResolvedValue(undefined);
  runtimeDependencies.beginCapture.mockResolvedValue({
    entryId: 'entry',
    incarnation: 'incarnation',
    epoch: 'epoch',
    sequence: 1,
    createdAt: 1,
  });
  runtimeDependencies.loadPreferences.mockResolvedValue({
    language: 'ru-RU',
    microphoneDeviceId: null,
    mode: 'local-first',
  });
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

export { runtimeDependencies };

/** Holds model processing while a capture-era command response is delivered. */
export async function createProcessingSessionFixture(
  schedule?: (callback: () => void, delayMs: number) => void,
  existingCoordinator?: ReturnType<typeof createVoiceInputCoordinator>
) {
  runtimeDependencies.loadPreferences.mockResolvedValue({
    language: 'ru-RU',
    microphoneDeviceId: null,
    mode: 'local-first',
    backend: 'model',
  });
  const scope = {
    entryId: 'entry',
    incarnation: 'incarnation',
    epoch: 'epoch',
    revision: 1,
    audioDigest: 'sha256:' + 'a'.repeat(64),
  };
  const entry = {
    ...scope,
    sequence: 1,
    createdAt: 1,
    backend: 'model',
    language: 'ru-RU',
    durationSeconds: 1,
    transcript: 'final',
  };
  runtimeDependencies.get.mockResolvedValue(entry);
  let resolveProcessing!: (entry: unknown) => void;
  runtimeDependencies.run.mockImplementation((args) => {
    args.onPhase('processing-asr', scope);
    return new Promise((resolve) => {
      resolveProcessing = resolve;
    });
  });
  const coordinator = existingCoordinator ?? createVoiceInputCoordinator(schedule);
  const owner = createContentPort('processing');
  coordinator.registerPort(owner.port);
  owner.onMessage.emit({
    type: VoiceInputPortMessageType.START,
    requestId: 'start',
    sessionId: 'client',
    preferences: { language: 'ru-RU', mode: 'local-first' },
  });
  await flush();
  return {
    coordinator,
    owner,
    complete: () => resolveProcessing(entry),
    async transfer() {
      coordinator.handleOffscreenEvent({
        type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
        event: { type: 'VOICE_INPUT_CAPTURE_RELEASED', sessionId: 'offscreen-session-1' },
      });
      coordinator.handleOffscreenEvent({
        type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
        event: {
          type: 'VOICE_INPUT_CAPTURE_READY',
          sessionId: 'offscreen-session-1',
          scope,
          rawTranscript: null,
          durationSeconds: 1,
        },
      });
      await flush();
    },
  };
}
