import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import {
  createContentPort,
  createSnapshot,
  createVoiceInputCoordinator,
  flush,
  mocks,
} from './coordinator.test-support';

afterEach(() => vi.useRealTimers());

describe('background voice input stop cleanup', () => {
  it('times out a never-settling normal Stop and force-cleans the unlimited session', async () => {
    vi.useFakeTimers();
    let stopAttempt = 0;
    mocks.sendRuntimeMessage.mockImplementation(async (message) => {
      if (message.type !== MessageType.OFFSCREEN_VOICE_INPUT_STOP) {
        return { success: true, result: 'accepted' };
      }
      stopAttempt += 1;
      if (stopAttempt === 1) return new Promise(() => undefined);
      return { success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') };
    });
    const coordinator = createVoiceInputCoordinator();
    const owner = createContentPort('content-timeout');
    coordinator.registerPort(owner.port);
    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'start-timeout',
      sessionId: 'session-timeout',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    owner.onMessage.emit({
      requestId: 'stop-timeout',
      sessionId: 'session-timeout',
      type: VoiceInputPortMessageType.STOP,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await flush();

    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
        sessionId: 'offscreen-session-1',
        type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
      })
    );
  });

  it('bounds never-settling force and status recovery before retrying to verified idle', async () => {
    vi.useFakeTimers();
    const scheduled: Array<() => void> = [];
    let forceAttempt = 0;
    mocks.sendRuntimeMessage.mockImplementation(async (message) => {
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_START) {
        return { success: true, result: 'accepted' };
      }
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP && !message.force) {
        return { success: false };
      }
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP) {
        forceAttempt += 1;
        if (forceAttempt === 1) return new Promise(() => undefined);
        if (forceAttempt === 2) return { success: false };
        return { success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') };
      }
      return new Promise(() => undefined);
    });
    const coordinator = createVoiceInputCoordinator((callback) => scheduled.push(callback));
    const owner = createContentPort('content-recovery-timeout');
    coordinator.registerPort(owner.port);
    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'start-recovery-timeout',
      sessionId: 'session-recovery-timeout',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    owner.onMessage.emit({
      requestId: 'stop-recovery-timeout',
      sessionId: 'session-recovery-timeout',
      type: VoiceInputPortMessageType.STOP,
    });
    await flush();

    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(scheduled).toHaveLength(1);

    scheduled.shift()?.();
    await flush();
    const successor = createContentPort('content-after-recovery');
    coordinator.registerPort(successor.port);
    successor.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'start-after-recovery',
      sessionId: 'session-after-recovery',
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

  it('retains cleanup authority and retries an unverified unlimited-session stop', async () => {
    const scheduled: Array<() => void> = [];
    mocks.sendRuntimeMessage.mockImplementation(async (message) =>
      message.type === MessageType.OFFSCREEN_VOICE_INPUT_START
        ? { success: true, result: 'accepted' }
        : { success: false }
    );
    const coordinator = createVoiceInputCoordinator((callback) => scheduled.push(callback));
    const owner = createContentPort('content-1');
    coordinator.registerPort(owner.port);
    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    owner.onMessage.emit({
      requestId: 'stop-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.STOP,
    });
    await flush();

    expect(scheduled).toHaveLength(1);
    mocks.sendRuntimeMessage.mockImplementation(async (message) =>
      message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP
        ? { success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') }
        : { success: true, result: 'accepted' }
    );
    scheduled.shift()?.();
    await flush();

    const successor = createContentPort('content-2');
    coordinator.registerPort(successor.port);
    successor.onMessage.emit({
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
