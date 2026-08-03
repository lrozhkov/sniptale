import {
  createContentPort,
  createPort,
  createSnapshot,
  createTab,
  createVoiceInputCoordinator,
  flush,
  mocks,
} from './coordinator.test-support';
import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';

describe('background voice input coordinator', () => {
  it('accepts the exact Settings document when Chrome reports its host tab', async () => {
    const coordinator = createVoiceInputCoordinator();
    const settings = createPort('settings-tab-document', createTab(7));
    coordinator.registerPort(settings.port);
    settings.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'start-tab',
      sessionId: 'settings-session',
      type: VoiceInputPortMessageType.START,
    });
    await flush();

    expect(settings.disconnect).not.toHaveBeenCalled();
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        maxDurationMs: 30_000,
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    );
  });

  it('starts Design Review content voice input without a session deadline', async () => {
    const coordinator = createVoiceInputCoordinator();
    const content = createContentPort('content-document');
    coordinator.registerPort(content.port);
    content.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'start-content',
      sessionId: 'content-session',
      type: VoiceInputPortMessageType.START,
    });
    await flush();

    expect(content.disconnect).not.toHaveBeenCalled();
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        maxDurationMs: null,
        type: MessageType.OFFSCREEN_VOICE_INPUT_START,
      })
    );
  });

  it('keeps one Port owner and relays transcript only to that consumer', async () => {
    const coordinator = createVoiceInputCoordinator();
    const first = createPort('settings-1');
    const second = createPort('settings-2');
    coordinator.registerPort(first.port);
    coordinator.registerPort(second.port);

    first.onMessage.emit({
      preferences: { language: 'ru-RU', mode: 'local-first' },
      requestId: 'request-1',
      sessionId: 'session-1',
      type: VoiceInputPortMessageType.START,
    });
    second.onMessage.emit({
      preferences: { language: 'en-US', mode: 'browser-managed' },
      requestId: 'request-2',
      sessionId: 'session-2',
      type: VoiceInputPortMessageType.START,
    });
    await flush();

    expect(second.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'busy-speech', type: VoiceInputPortMessageType.FAILURE })
    );
    coordinator.handleOffscreenEvent({
      event: {
        confidence: 0.9,
        isFinal: true,
        sequence: 1,
        sessionId: 'offscreen-session-1',
        text: 'private transcript',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      },
      type: MessageType.OFFSCREEN_VOICE_INPUT_EVENT,
    });
    expect(first.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'private transcript' })
    );
    expect(second.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: 'private transcript' })
    );
  });

  it('stops its session when the owning document disconnects', async () => {
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
    owner.onDisconnect.emit(owner.port);
    await flush();

    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityToken: 'capability',
        force: false,
        sessionId: 'offscreen-session-1',
        type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
      })
    );
  });

  it.each(['explicit stop', 'owner disconnect'] as const)(
    'force-cleans an unlimited content session after a failed %s delivery',
    async (trigger) => {
      let stopAttempt = 0;
      mocks.sendRuntimeMessage.mockImplementation(async (message) => {
        if (message.type !== MessageType.OFFSCREEN_VOICE_INPUT_STOP) {
          return { success: true, result: 'accepted' };
        }
        stopAttempt += 1;
        return stopAttempt === 1
          ? { success: false }
          : { success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') };
      });
      const coordinator = createVoiceInputCoordinator();
      const owner = createContentPort('content-owner');
      coordinator.registerPort(owner.port);
      owner.onMessage.emit({
        preferences: { language: 'ru-RU', mode: 'local-first' },
        requestId: 'start-content',
        sessionId: 'content-session',
        type: VoiceInputPortMessageType.START,
      });
      await flush();

      if (trigger === 'explicit stop') {
        owner.onMessage.emit({
          requestId: 'stop-content',
          sessionId: 'content-session',
          type: VoiceInputPortMessageType.STOP,
        });
      } else {
        owner.onDisconnect.emit(owner.port);
      }
      await flush();

      expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
          sessionId: 'offscreen-session-1',
          type: MessageType.OFFSCREEN_VOICE_INPUT_STOP,
        })
      );

      const successor = createContentPort('content-successor');
      coordinator.registerPort(successor.port);
      successor.onMessage.emit({
        preferences: { language: 'ru-RU', mode: 'local-first' },
        requestId: 'start-successor',
        sessionId: 'successor-session',
        type: VoiceInputPortMessageType.START,
      });
      await flush();

      expect(
        mocks.sendRuntimeMessage.mock.calls.filter(
          ([message]) => message.type === MessageType.OFFSCREEN_VOICE_INPUT_START
        )
      ).toHaveLength(2);
    }
  );

  it('disconnects an unauthorized Port before attaching listeners', () => {
    const coordinator = createVoiceInputCoordinator();
    const candidate = createPort('settings-1');
    Object.assign(candidate.port, { sender: undefined });
    coordinator.registerPort(candidate.port);
    expect(candidate.disconnect).toHaveBeenCalledOnce();
  });

  it('does not dispatch a delayed start after its Port was disconnected', async () => {
    let resolveReady: (() => void) | undefined;
    mocks.ensureOffscreenDocument.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveReady = () => resolve(true);
      })
    );
    mocks.sendRuntimeMessage.mockImplementation(async (message) =>
      message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP
        ? { success: true, result: 'stale' }
        : { success: true, result: 'accepted' }
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
    owner.onDisconnect.emit(owner.port);
    await flush();
    resolveReady?.();
    await flush();

    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.OFFSCREEN_VOICE_INPUT_START })
    );
  });
});
