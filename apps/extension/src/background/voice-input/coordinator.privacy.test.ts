import {
  createPort,
  createSnapshot,
  createVoiceInputCoordinator,
  flush,
  mocks,
} from './coordinator.test-support';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

afterEach(() => vi.useRealTimers());

describe('background voice input coordinator cleanup', () => {
  it('does not create a cold offscreen document when no voice authority exists', async () => {
    mocks.getRuntimeContexts.mockResolvedValueOnce([]);

    const coordinator = createVoiceInputCoordinator();

    await expect(coordinator.cleanupForPrivacyErasure()).resolves.toBe(true);
    expect(mocks.ensureOffscreenDocument).not.toHaveBeenCalled();
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  });

  it.each(['status', 'force-stop'] as const)(
    'returns failure when privacy cleanup %s never settles',
    async (pendingExchange) => {
      vi.useFakeTimers();
      mocks.sendRuntimeMessage.mockImplementation(async (message) => {
        if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS) {
          return pendingExchange === 'status'
            ? new Promise(() => undefined)
            : { snapshot: createSnapshot('orphan-after-worker-restart'), success: true };
        }
        return new Promise(() => undefined);
      });
      const coordinator = createVoiceInputCoordinator();
      const cleanup = coordinator.cleanupForPrivacyErasure();
      await flush();

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(cleanup).resolves.toBe(false);
    }
  );

  it('force-stops an orphaned offscreen session during privacy erasure', async () => {
    mocks.sendRuntimeMessage.mockImplementation(async (message) => {
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS) {
        return { snapshot: createSnapshot('orphan-after-worker-restart'), success: true };
      }
      return {
        result: 'accepted',
        snapshot: createSnapshot(null, 'idle'),
        success: true,
      };
    });
    const coordinator = createVoiceInputCoordinator();
    await expect(coordinator.cleanupForPrivacyErasure()).resolves.toBe(true);
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
        sessionId: 'orphan-after-worker-restart',
        type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
      })
    );
  });

  it('clears stale stops, contains stop failures, and supports privacy cleanup', async () => {
    const coordinator = createVoiceInputCoordinator();
    const port = createPort('settings-1');
    coordinator.registerPort(port.port);
    port.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    mocks.sendRuntimeMessage.mockResolvedValueOnce({ result: 'stale', success: true });
    port.onMessage.emit({
      requestId: 'stop-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.STOP,
    });
    await flush();

    const callsAfterStop = mocks.sendRuntimeMessage.mock.calls.length;
    mocks.sendRuntimeMessage.mockResolvedValue({
      snapshot: {
        apiFlavor: 'standard',
        busyOwner: null,
        effectiveMode: null,
        errorCode: null,
        fallbackReason: null,
        language: 'ru-RU',
        localAvailability: 'unknown',
        phase: 'idle',
        quality: 'dictation',
        qualitySupported: true,
        requestedMode: 'local-first',
        sessionId: null,
      },
      success: true,
    });
    await expect(coordinator.cleanupForPrivacyErasure()).resolves.toBe(true);
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(callsAfterStop + 1);

    const failing = createVoiceInputCoordinator();
    const failingPort = createPort('settings-2');
    failing.registerPort(failingPort.port);
    mocks.sendRuntimeMessage.mockResolvedValue({ result: 'accepted', success: true });
    failingPort.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-2',
      sessionId: 'session-2',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    mocks.sendRuntimeMessage.mockRejectedValue(new Error('private stop failure'));
    await expect(failing.cleanupForPrivacyErasure()).resolves.toBe(false);
  });

  it('ignores malformed, stale, and terminal callbacks after releasing the owner', async () => {
    const coordinator = createVoiceInputCoordinator();
    const port = createPort('settings-1');
    coordinator.registerPort(port.port);
    coordinator.handleOffscreenEvent({
      event: {
        confidence: null,
        isFinal: true,
        sequence: 1,
        sessionId: 'orphan',
        text: 'ignored',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });
    expect(port.postMessage).not.toHaveBeenCalled();

    port.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    coordinator.handleOffscreenEvent({
      event: {
        requestId: 'request-1',
        snapshot: {
          apiFlavor: 'standard',
          busyOwner: null,
          effectiveMode: 'local',
          errorCode: null,
          fallbackReason: null,
          language: 'ru-RU',
          localAvailability: 'available',
          phase: 'ended',
          quality: 'dictation',
          qualitySupported: true,
          requestedMode: 'local-first',
          sessionId: 'session-1',
        },
        type: VoiceInputPortMessageType.SNAPSHOT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });
    coordinator.handleOffscreenEvent({
      event: {
        confidence: 0.5,
        isFinal: true,
        sequence: 2,
        sessionId: 'session-1',
        text: 'late',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });
    expect(port.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ text: 'late' }));
  });
});
