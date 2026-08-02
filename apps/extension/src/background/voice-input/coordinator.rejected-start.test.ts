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

describe('background voice input rejected Start reconciliation', () => {
  it('force-stops an offscreen session when Start commits but its response is lost', async () => {
    let offscreenLeaseHeld = false;
    mocks.sendRuntimeMessage.mockImplementation(async (message) => {
      if (
        message.type === MessageType.OFFSCREEN_VOICE_INPUT_START &&
        message.requestId === 'request-1'
      ) {
        offscreenLeaseHeld = true;
        throw new Error('response channel closed after execution');
      }
      if (
        message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP &&
        message.sessionId === 'offscreen-session-1'
      ) {
        offscreenLeaseHeld = false;
        return { result: 'accepted', snapshot: createSnapshot(null, 'idle'), success: true };
      }
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_START) {
        offscreenLeaseHeld = true;
        return {
          result: 'accepted',
          snapshot: createSnapshot(message.sessionId, 'starting'),
          success: true,
        };
      }
      return { result: 'stale', snapshot: createSnapshot(null, 'idle'), success: true };
    });
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

    expect(offscreenLeaseHeld).toBe(false);
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
        sessionId: 'offscreen-session-1',
        type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
      })
    );
    expect(owner.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ errorCode: 'offscreen-unavailable', sessionId: 'session-1' })
    );

    owner.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'request-2',
      sessionId: 'session-2',
      type: VoiceInputPortMessageType.START,
    });
    await flush();

    expect(offscreenLeaseHeld).toBe(true);
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'offscreen-session-2',
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    );
  });

  it('does not admit a successor while rollback observes another active offscreen session', async () => {
    const foreignActiveSnapshot = createSnapshot('foreign-offscreen-session', 'listening');
    mocks.sendRuntimeMessage.mockImplementation(async (message) => {
      if (
        message.type === MessageType.OFFSCREEN_VOICE_INPUT_START &&
        message.requestId === 'request-1'
      ) {
        throw new Error('response channel closed after execution');
      }
      if (
        message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP ||
        message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS
      ) {
        return { result: 'stale', snapshot: foreignActiveSnapshot, success: true };
      }
      return { result: 'accepted', success: true };
    });
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
    owner.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'request-2',
      sessionId: 'session-2',
      type: VoiceInputPortMessageType.START,
    });
    await flush();

    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-2',
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    );
    expect(owner.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: 'busy-speech',
        requestId: 'request-2',
        sessionId: 'session-2',
      })
    );
  });

  it('retires a synchronously rejected offscreen Start when its event is lost', async () => {
    const rejectedSnapshot = {
      apiFlavor: 'standard' as const,
      busyOwner: 'video-recording' as const,
      effectiveMode: null,
      errorCode: 'busy-video' as const,
      fallbackReason: null,
      language: 'ru-RU' as const,
      localAvailability: 'unknown' as const,
      phase: 'error' as const,
      quality: 'dictation' as const,
      qualitySupported: true,
      requestedMode: 'local-first' as const,
      sessionId: 'offscreen-session-1',
    };
    mocks.sendRuntimeMessage
      .mockResolvedValueOnce({
        result: 'accepted',
        snapshot: rejectedSnapshot,
        success: true,
      })
      .mockResolvedValue({ result: 'accepted', success: true });
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
    expect(owner.postMessage).toHaveBeenLastCalledWith({
      errorCode: 'busy-video',
      requestId: 'request-1',
      sessionId: 'session-1',
      snapshot: { ...rejectedSnapshot, sessionId: 'session-1' },
      type: VoiceInputPortMessageType.FAILURE,
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
});
