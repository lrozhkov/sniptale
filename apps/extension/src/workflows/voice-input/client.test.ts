import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { createVoiceInputClient } from './client';

describe('voice input workflow client', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates session-scoped Port commands and parses server events', () => {
    const connection = createRuntimePortFixture();
    const ids = ['request-1', 'session-1'];
    const client = createVoiceInputClient({
      connect: () => connection.port,
      createId: () => ids.shift() ?? 'next-id',
      schedule: vi.fn(),
    });
    const listener = vi.fn();
    client.subscribe(listener);

    expect(client.start({ language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' })).toBe(
      'session-1'
    );
    expect(connection.port.postMessage).toHaveBeenCalledWith({
      preferences: { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    connection.onMessage.emit({
      confidence: 0.9,
      isFinal: true,
      sequence: 1,
      sessionId: 'session-1',
      text: 'result',
      type: VoiceInputPortMessageType.TRANSCRIPT,
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ text: 'result' }));
    connection.onMessage.emit({ type: 'INVALID', text: 'ignored' });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('keeps the owned session when duplicate starts or foreign failures arrive', () => {
    const connection = createRuntimePortFixture();
    const ids = ['request-1', 'session-1'];
    const client = createVoiceInputClient({
      connect: () => connection.port,
      createId: () => ids.shift() ?? 'unexpected-id',
      schedule: vi.fn(),
    });

    expect(client.start({ language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' })).toBe(
      'session-1'
    );
    expect(
      client.start({ language: 'en-US', microphoneDeviceId: null, mode: 'browser-managed' })
    ).toBe('session-1');
    expect(connection.port.postMessage).toHaveBeenCalledOnce();
    connection.onMessage.emit({
      errorCode: 'busy-speech',
      sessionId: 'foreign-session',
      snapshot: {
        apiFlavor: 'standard',
        busyOwner: 'speech-recognition',
        effectiveMode: null,
        errorCode: 'busy-speech',
        fallbackReason: null,
        language: 'en-US',
        localAvailability: 'unknown',
        phase: 'error',
        quality: 'dictation',
        qualitySupported: true,
        requestedMode: 'browser-managed',
        sessionId: 'foreign-session',
      },
      type: VoiceInputPortMessageType.FAILURE,
    });
    expect(client.start({ language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' })).toBe(
      'session-1'
    );
    expect(connection.port.postMessage).toHaveBeenCalledOnce();
  });

  it('fails the active session and opens a reconciliation Port after SW disconnect', () => {
    const first = createRuntimePortFixture();
    const second = createRuntimePortFixture();
    const connect = vi.fn().mockReturnValueOnce(first.port).mockReturnValueOnce(second.port);
    let scheduled: (() => void) | undefined;
    const listener = vi.fn();
    const client = createVoiceInputClient({
      connect,
      createId: vi
        .fn()
        .mockReturnValueOnce('request-1')
        .mockReturnValueOnce('session-1')
        .mockReturnValue('reconcile-1'),
      schedule: (callback) => {
        scheduled = callback;
      },
    });
    client.subscribe(listener);
    client.start({ language: 'en-US', microphoneDeviceId: null, mode: 'browser-managed' });

    first.onDisconnect.emit(first.port);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'offscreen-unavailable',
        sessionId: 'session-1',
        type: VoiceInputPortMessageType.FAILURE,
      })
    );
    scheduled?.();
    expect(second.port.postMessage).toHaveBeenCalledWith({
      requestId: 'reconcile-1',
      type: VoiceInputPortMessageType.STATUS,
    });
  });

  it('rolls back a failed START dispatch so a later Start can retry', () => {
    const first = createRuntimePortFixture();
    const second = createRuntimePortFixture();
    first.port.postMessage = vi.fn(() => {
      throw new Error('port closed');
    });
    const connect = vi.fn().mockReturnValueOnce(first.port).mockReturnValueOnce(second.port);
    const ids = ['request-1', 'session-1', 'request-2', 'session-2'];
    const client = createVoiceInputClient({
      connect,
      createId: () => ids.shift() ?? 'reconcile',
      schedule: vi.fn(),
    });

    expect(() =>
      client.start({ language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' })
    ).toThrow('Voice input runtime is unavailable.');
    expect(client.start({ language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' })).toBe(
      'session-2'
    );
    expect(second.port.postMessage).toHaveBeenCalledWith({
      preferences: { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' },
      requestId: 'request-2',
      sessionId: 'session-2',
      type: VoiceInputPortMessageType.START,
    });
  });

  it('reconciles a still-active session before the offscreen watchdog window', () => {
    const connection = createRuntimePortFixture();
    let reconcile: (() => void) | undefined;
    const schedule = vi.fn((callback: () => void, delayMs: number) => {
      if (delayMs === 1_500) reconcile = callback;
    });
    const ids = ['request-1', 'session-1', 'status-1'];
    const client = createVoiceInputClient({
      connect: () => connection.port,
      createId: () => ids.shift() ?? 'next-id',
      schedule,
    });

    client.start({ language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' });
    reconcile?.();

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 1_500);
    expect(connection.port.postMessage).toHaveBeenLastCalledWith({
      requestId: 'status-1',
      type: VoiceInputPortMessageType.STATUS,
    });
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 2_000);
  });
});
