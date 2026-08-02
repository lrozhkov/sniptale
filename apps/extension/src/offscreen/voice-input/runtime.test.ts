import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

const mocks = vi.hoisted(() => ({
  addEventListener: vi.fn(),
  abortOnUnload: vi.fn(),
  authorize: vi.fn(),
  connect: vi.fn(),
  getSnapshot: vi.fn(),
  listener: null as
    | ((
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse?: (response?: unknown) => void
      ) => boolean | undefined)
    | null,
  runtimeSend: vi.fn(),
  serviceDeps: null as { emit(event: unknown): Promise<unknown> } | null,
  start: vi.fn(),
  stop: vi.fn(),
  telemetryDisconnect: vi.fn(),
  telemetryOnDisconnectAdd: vi.fn(),
  telemetryOnDisconnectRemove: vi.fn(),
  telemetryPost: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: {
    connect: mocks.connect,
    subscribeToMessages: vi.fn((listener) => {
      mocks.listener = listener;
      return vi.fn();
    }),
  },
}));

vi.mock('@sniptale/platform/browser/speech-recognition', () => ({
  createSpeechRecognitionSession: vi.fn(),
  loadSpeechRecognitionAvailability: vi.fn(),
  resolveSpeechRecognitionApi: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn() }),
}));

vi.mock('../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: () => ({ sendRuntimeMessage: mocks.runtimeSend }),
}));

vi.mock('../runtime/authorization', () => ({
  authorizeOffscreenRuntimeCommand: mocks.authorize,
}));

vi.mock('./service', () => ({
  createOffscreenVoiceInputService: (deps: { emit(event: unknown): Promise<unknown> }) => {
    mocks.serviceDeps = deps;
    return {
      abortOnUnload: mocks.abortOnUnload,
      getSnapshot: mocks.getSnapshot,
      start: mocks.start,
      stop: mocks.stop,
    };
  },
}));

import { registerOffscreenVoiceInputMessageListener } from './runtime';

const sender = {
  id: 'extension-id',
  url: 'chrome-extension://extension-id/apps/extension/src/background/index.js',
} satisfies chrome.runtime.MessageSender;
let generationSequence = 0;

function startMessage() {
  return {
    capabilityToken: 'capability',
    preferences: {
      language: 'ru-RU' as const,
      microphoneDeviceId: null,
      mode: 'local-first' as const,
    },
    quality: 'dictation' as const,
    requestId: 'request-1',
    sessionId: 'session-1',
    type: MessageType.OFFSCREEN_VOICE_INPUT_START,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('addEventListener', mocks.addEventListener);
  mocks.listener = null;
  mocks.connect.mockReturnValue({
    disconnect: mocks.telemetryDisconnect,
    onDisconnect: {
      addListener: mocks.telemetryOnDisconnectAdd,
      removeListener: mocks.telemetryOnDisconnectRemove,
    },
    postMessage: mocks.telemetryPost,
  });
  mocks.runtimeSend.mockResolvedValue({ success: true });
  mocks.getSnapshot.mockReturnValue({ phase: 'idle' });
  mocks.start.mockReturnValue({ phase: 'starting', sessionId: 'session-1' });
  mocks.stop.mockReturnValue('accepted');
  generationSequence += 1;
  const generation = `generation-${generationSequence}`;
  mocks.authorize.mockImplementation(({ message }) => ({
    authorized: true,
    capabilityGeneration: generation,
    message,
  }));
  registerOffscreenVoiceInputMessageListener();
});

describe('offscreen voice input runtime boundary', () => {
  it('streams lossy audio frames over a Port while durable events keep runtime authorization', async () => {
    const peaks = Array.from({ length: 16 }, (_, index) => index / 16);
    await mocks.serviceDeps?.emit({
      level: 0.42,
      peaks,
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.AUDIO_LEVEL,
    });

    expect(mocks.connect).toHaveBeenCalledWith({
      name: 'sniptale:voice-input-telemetry:v1',
    });
    expect(mocks.telemetryPost).toHaveBeenCalledWith(
      expect.objectContaining({ level: 0.42, peaks })
    );
    expect(mocks.runtimeSend).not.toHaveBeenCalled();

    await mocks.serviceDeps?.emit({
      confidence: 0.8,
      isFinal: false,
      sequence: 1,
      sessionId: 'session-1',
      text: 'private transcript',
      type: VoiceInputPortMessageType.TRANSCRIPT,
    });
    expect(mocks.runtimeSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT })
    );

    await mocks.serviceDeps?.emit({
      errorCode: 'unexpected',
      sessionId: 'session-1',
      snapshot: { phase: 'error' },
      type: VoiceInputPortMessageType.FAILURE,
    });
    expect(mocks.telemetryDisconnect).toHaveBeenCalledOnce();
  });

  it('authorizes, parses, and replays the exact response for a duplicate start', async () => {
    const respond = vi.fn();
    expect(mocks.listener?.(startMessage(), sender, respond)).toBe(false);
    mocks.start.mockReturnValue({
      errorCode: 'busy',
      phase: 'error',
      sessionId: 'different-session',
    });
    expect(mocks.listener?.(startMessage(), sender, respond)).toBe(true);

    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.start).toHaveBeenCalledWith({
      preferences: { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
    });
    await vi.waitFor(() => {
      expect(respond).toHaveBeenCalledTimes(2);
    });
    expect(respond.mock.calls).toEqual([
      [
        {
          result: 'accepted',
          snapshot: { phase: 'starting', sessionId: 'session-1' },
          success: true,
        },
      ],
      [
        {
          result: 'accepted',
          snapshot: { phase: 'starting', sessionId: 'session-1' },
          success: true,
        },
      ],
    ]);
  });

  it('rejects before parsing when sender authorization fails', () => {
    mocks.authorize.mockReturnValue({ authorized: false, reason: 'wrong-sender' });
    const respond = vi.fn();
    expect(mocks.listener?.(startMessage(), sender, respond)).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('replays the original status snapshot without rereading mutable recognition state', async () => {
    const snapshot = { phase: 'idle' };
    mocks.getSnapshot.mockReturnValue(snapshot);
    const respond = vi.fn();
    const message = {
      capabilityToken: 'capability',
      requestId: 'status-1',
      type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
    };
    expect(mocks.listener?.(message, sender, respond)).toBe(false);
    mocks.getSnapshot.mockReturnValue({ phase: 'listening', sessionId: 'new-session' });
    expect(mocks.listener?.(message, sender, respond)).toBe(true);

    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
    expect(mocks.getSnapshot).toHaveBeenCalledOnce();
    expect(respond.mock.calls).toEqual([
      [{ success: true, snapshot }],
      [{ success: true, snapshot }],
    ]);
  });

  it('routes stop commands and replays the exact service idempotency result', async () => {
    mocks.stop.mockReturnValue('stale');
    const respond = vi.fn();
    const message = {
      capabilityToken: 'capability',
      force: false,
      requestId: 'stop-1',
      sessionId: 'session-1',
      type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
    };
    expect(mocks.listener?.(message, sender, respond)).toBe(false);
    mocks.stop.mockReturnValue('accepted');
    expect(mocks.listener?.(message, sender, respond)).toBe(true);

    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
    expect(mocks.stop).toHaveBeenCalledWith('session-1', false);
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(respond.mock.calls).toEqual([
      [{ success: true, result: 'stale', snapshot: { phase: 'idle' } }],
      [{ success: true, result: 'stale', snapshot: { phase: 'idle' } }],
    ]);
  });

  it('ignores unrelated messages and rejects malformed authorized commands', () => {
    const respond = vi.fn();
    expect(mocks.listener?.({ type: 'UNRELATED' }, sender, respond)).toBeUndefined();
    expect(mocks.authorize).not.toHaveBeenCalled();

    expect(
      mocks.listener?.(
        { ...startMessage(), preferences: { language: 'fr-FR', mode: 'local-first' } },
        sender,
        respond
      )
    ).toBe(false);
    expect(respond).toHaveBeenCalledWith({ success: false, error: 'Invalid voice input command' });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('supports fire-and-forget rejection paths without manufacturing a response', () => {
    mocks.authorize.mockReturnValueOnce({ authorized: false, reason: 'wrong-document' });
    expect(mocks.listener?.(startMessage(), sender)).toBeUndefined();

    mocks.authorize.mockReturnValueOnce({
      authorized: true,
      capabilityGeneration: `malformed-${generationSequence}`,
      message: { ...startMessage(), quality: 'command' },
    });
    expect(mocks.listener?.(startMessage(), sender)).toBeUndefined();
  });

  it('bounds the replay registry and aborts the active session on unload', () => {
    let sequence = 0;
    mocks.authorize.mockImplementation(({ message }) => ({
      authorized: true,
      capabilityGeneration: `bounded-${generationSequence}-${sequence++}`,
      message,
    }));
    for (let index = 0; index < 130; index += 1) {
      mocks.listener?.(
        {
          capabilityToken: 'capability',
          requestId: `status-${index}`,
          type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
        },
        sender,
        vi.fn()
      );
    }
    expect(mocks.getSnapshot).toHaveBeenCalledTimes(130);

    const beforeUnload = mocks.addEventListener.mock.calls.find(
      ([type]) => type === 'beforeunload'
    )?.[1] as (() => void) | undefined;
    beforeUnload?.();
    expect(mocks.abortOnUnload).toHaveBeenCalledOnce();
  });
});
