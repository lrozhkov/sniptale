import { createPort, createVoiceInputCoordinator, flush, mocks } from './coordinator.test-support';
import { describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';

describe('background voice input coordinator boundary failures', () => {
  it('ignores a delayed Start failure after exact session authority moved to a successor', async () => {
    let resolveFirstStart: ((value: unknown) => void) | undefined;
    mocks.sendRuntimeMessage.mockImplementation((message) => {
      if (
        message.type === MessageType.OFFSCREEN_VOICE_INPUT_START &&
        message.requestId === 'request-1'
      ) {
        return new Promise((resolve) => {
          resolveFirstStart = resolve;
        });
      }
      if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP) {
        return Promise.resolve({ result: 'stale', success: true });
      }
      return Promise.resolve({ result: 'accepted', success: true });
    });
    const coordinator = createVoiceInputCoordinator();
    const first = createPort('settings-1');
    coordinator.registerPort(first.port);
    first.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'reused-session',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    first.onDisconnect.emit(first.port);
    await flush();

    const successor = createPort('settings-2');
    coordinator.registerPort(successor.port);
    successor.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'request-2',
      sessionId: 'reused-session',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    resolveFirstStart?.({ success: false });
    await flush();

    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'request-2',
        sessionId: 'offscreen-session-2',
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    );
    expect(successor.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'offscreen-unavailable', requestId: 'request-1' })
    );
  });

  it('ignores unrelated Ports, malformed requests, and stop attempts from non-owners', async () => {
    const coordinator = createVoiceInputCoordinator();
    const unrelated = createRuntimePortFixture({ name: 'unrelated' });
    coordinator.registerPort(unrelated.port);
    unrelated.onMessage.emit({ requestId: 'ignored', type: VoiceInputPortMessageType.STATUS });
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();

    const owner = createPort('settings-1');
    const other = createPort('settings-2');
    coordinator.registerPort(owner.port);
    coordinator.registerPort(other.port);
    owner.onMessage.emit({ requestId: '', type: VoiceInputPortMessageType.STATUS });
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();

    owner.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    vi.clearAllMocks();
    other.onMessage.emit({
      requestId: 'stop-other',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.STOP,
    });
    await flush();
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  });

  it('surfaces status failures without leaking the offscreen exception', async () => {
    mocks.sendRuntimeMessage.mockResolvedValue({ success: false });
    const coordinator = createVoiceInputCoordinator();
    const port = createPort('settings-1');
    coordinator.registerPort(port.port);
    port.onMessage.emit({ requestId: 'status-failed', type: VoiceInputPortMessageType.STATUS });
    await flush();

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'offscreen-unavailable',
        type: VoiceInputPortMessageType.FAILURE,
      })
    );
  });

  it('keeps the active owner snapshot when a delayed status belongs to another session', async () => {
    const foreignSnapshot = {
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
      sessionId: 'foreign-session',
    };
    mocks.sendRuntimeMessage.mockImplementation(async (message) =>
      message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS
        ? { snapshot: foreignSnapshot, success: true }
        : { result: 'accepted', success: true }
    );
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
    port.onMessage.emit({ requestId: 'status-1', type: VoiceInputPortMessageType.STATUS });
    await flush();

    expect(port.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({ phase: 'starting', sessionId: 'session-1' }),
      })
    );
  });

  it('maps privacy exclusion and rejected starts to stable failure codes', async () => {
    const privacyCoordinator = createVoiceInputCoordinator();
    const privacyPort = createPort('settings-privacy');
    privacyCoordinator.registerPort(privacyPort.port);
    mocks.acquireMediaMutationPermit.mockReturnValue(null);
    privacyPort.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-privacy',
      sessionId: 'session-privacy',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    expect(privacyPort.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ errorCode: 'privacy-erasure-in-progress' })
    );

    mocks.acquireMediaMutationPermit.mockReturnValue(vi.fn());
    mocks.sendRuntimeMessage.mockResolvedValue({ success: false });
    const rejectedCoordinator = createVoiceInputCoordinator();
    const rejectedPort = createPort('settings-rejected');
    rejectedCoordinator.registerPort(rejectedPort.port);
    rejectedPort.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'request-rejected',
      sessionId: 'session-rejected',
      type: VoiceInputPortMessageType.START,
    });
    await flush();
    expect(rejectedPort.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ errorCode: 'offscreen-unavailable' })
    );
  });
});
