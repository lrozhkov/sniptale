import {
  createPort,
  createSnapshot,
  createVoiceInputCoordinator,
  flush,
  mocks,
} from './coordinator.test-support';
import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

describe('background voice input lifecycle reconciliation', () => {
  it('uses an internal nonce so a delayed event cannot affect a successor with the same client id', async () => {
    const coordinator = createVoiceInputCoordinator();
    const owner = createPort('settings-1');
    coordinator.registerPort(owner.port);
    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'reused-client-session',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    coordinator.handleOffscreenEvent({
      event: {
        snapshot: createSnapshot('offscreen-session-1', 'ended'),
        type: VoiceInputPortMessageType.SNAPSHOT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });
    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-2',
      sessionId: 'reused-client-session',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    coordinator.handleOffscreenEvent({
      event: {
        confidence: 0.7,
        isFinal: true,
        sequence: 1,
        sessionId: 'offscreen-session-1',
        text: 'stale transcript',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });
    coordinator.handleOffscreenEvent({
      event: {
        confidence: 0.8,
        isFinal: true,
        sequence: 1,
        sessionId: 'offscreen-session-2',
        text: 'current transcript',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });
    expect(owner.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: 'stale transcript' })
    );
    expect(owner.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'reused-client-session',
        text: 'current transcript',
      })
    );
  });

  it('reconciles an orphaned offscreen session after a service worker restart', async () => {
    const activeSnapshot = {
      apiFlavor: 'standard',
      busyOwner: 'speech-recognition',
      effectiveMode: 'local',
      errorCode: null,
      fallbackReason: null,
      language: 'ru-RU',
      localAvailability: 'available',
      phase: 'listening',
      quality: 'dictation',
      qualitySupported: true,
      requestedMode: 'local-first',
      sessionId: 'orphan-session',
    };
    mocks.sendRuntimeMessage.mockImplementation(async (message) =>
      message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS
        ? { success: true, snapshot: activeSnapshot }
        : { success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') }
    );
    const coordinator = createVoiceInputCoordinator();
    const port = createPort('settings-1');
    coordinator.registerPort(port.port);
    port.onMessage.emit({ requestId: 'status-1', type: VoiceInputPortMessageType.STATUS });
    await flush();

    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'orphan-session',
        type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
      })
    );
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ phase: 'idle', sessionId: null }),
        type: VoiceInputPortMessageType.SNAPSHOT,
      })
    );
  });
});

describe('background voice input worker recovery', () => {
  it('retires the active owner when status recovers a missed terminal event', async () => {
    const terminalSnapshot = {
      apiFlavor: 'standard' as const,
      busyOwner: null,
      effectiveMode: 'local' as const,
      errorCode: null,
      fallbackReason: null,
      language: 'ru-RU' as const,
      localAvailability: 'available' as const,
      phase: 'ended' as const,
      quality: 'dictation' as const,
      qualitySupported: true,
      requestedMode: 'local-first' as const,
      sessionId: 'offscreen-session-1',
    };
    mocks.sendRuntimeMessage.mockImplementation(async (message) =>
      message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS
        ? { snapshot: terminalSnapshot, success: true }
        : { result: 'accepted', success: true }
    );
    const coordinator = createVoiceInputCoordinator();
    const owner = createPort('settings-1');
    coordinator.registerPort(owner.port);
    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    await flush();

    owner.onMessage.emit({ requestId: 'status-1', type: VoiceInputPortMessageType.STATUS });
    await flush();
    expect(owner.postMessage).toHaveBeenLastCalledWith({
      requestId: 'status-1',
      snapshot: { ...terminalSnapshot, sessionId: 'session-1' },
      type: VoiceInputPortMessageType.SNAPSHOT,
    });

    owner.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'request-2',
      sessionId: 'session-2',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'offscreen-session-2',
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    );
  });

  it('retires only the observed active session when offscreen restarts to idle', async () => {
    const restartedSnapshot = {
      apiFlavor: 'unsupported' as const,
      busyOwner: null,
      effectiveMode: null,
      errorCode: null,
      fallbackReason: null,
      language: 'ru-RU' as const,
      localAvailability: 'unknown' as const,
      phase: 'idle' as const,
      quality: 'dictation' as const,
      qualitySupported: false,
      requestedMode: 'local-first' as const,
      sessionId: null,
    };
    mocks.sendRuntimeMessage.mockImplementation(async (message) =>
      message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS
        ? { snapshot: restartedSnapshot, success: true }
        : { result: 'accepted', success: true }
    );
    const coordinator = createVoiceInputCoordinator();
    const owner = createPort('settings-1');
    coordinator.registerPort(owner.port);
    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    await flush();

    owner.onMessage.emit({ requestId: 'status-restart', type: VoiceInputPortMessageType.STATUS });
    await flush();
    expect(owner.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: 'offscreen-unavailable',
        requestId: 'status-restart',
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.FAILURE,
      })
    );

    owner.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'request-2',
      sessionId: 'session-2',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'offscreen-session-2',
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    );
  });

  it('does not retire a new session from status dispatched before that session existed', async () => {
    let resolveStatus: ((response: unknown) => void) | undefined;
    mocks.sendRuntimeMessage.mockImplementation((message) =>
      message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS
        ? new Promise((resolve) => {
            resolveStatus = resolve;
          })
        : Promise.resolve({ result: 'accepted', success: true })
    );
    const coordinator = createVoiceInputCoordinator();
    const owner = createPort('settings-1');
    coordinator.registerPort(owner.port);
    owner.onMessage.emit({
      requestId: 'status-before-start',
      type: VoiceInputPortMessageType.STATUS,
    });
    await flush();
    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    await flush();

    resolveStatus?.({
      snapshot: {
        apiFlavor: 'unsupported',
        busyOwner: null,
        effectiveMode: null,
        errorCode: null,
        fallbackReason: null,
        language: 'ru-RU',
        localAvailability: 'unknown',
        phase: 'idle',
        quality: 'dictation',
        qualitySupported: false,
        requestedMode: 'local-first',
        sessionId: null,
      },
      success: true,
    });
    await flush();

    owner.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'request-2',
      sessionId: 'session-2',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-2',
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    );
    expect(owner.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ errorCode: 'busy-speech', sessionId: 'session-2' })
    );
  });
});
