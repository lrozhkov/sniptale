import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import {
  createContentPort,
  createProcessingSessionFixture,
  createSnapshot,
  createVoiceInputCoordinator,
  flush,
  mocks,
  runtimeDependencies,
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

describe('processing after microphone release', () => {
  it('keeps processing authority after Stop and STATUS without a one-second forced cancellation', async () => {
    vi.useFakeTimers();
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
    let complete!: (entry: unknown) => void;
    runtimeDependencies.run.mockImplementation((args) => {
      args.onPhase('processing-asr', scope);
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const coordinator = createVoiceInputCoordinator();
    const owner = createContentPort('processing');
    coordinator.registerPort(owner.port);
    owner.onMessage.emit({
      type: VoiceInputPortMessageType.START,
      requestId: 'start',
      sessionId: 'client',
      preferences: { language: 'ru-RU', mode: 'local-first' },
    });
    await flush();
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
    owner.onMessage.emit({
      type: VoiceInputPortMessageType.STOP,
      requestId: 'stop',
      sessionId: 'client',
    });
    owner.onMessage.emit({ type: VoiceInputPortMessageType.STATUS, requestId: 'status' });
    await vi.advanceTimersByTimeAsync(5_000);
    await flush();
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: MessageType.OFFSCREEN_VOICE_INPUT_STOP, force: true })
    );
    expect(owner.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'status',
        snapshot: expect.objectContaining({ phase: 'processing-asr' }),
      })
    );
    complete(entry);
    await flush();
    expect(owner.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: VoiceInputPortMessageType.TRANSCRIPT, text: 'final' })
    );
  });
});

describe('Stop response after capture authority transfer', () => {
  it.each(['ended', 'error', 'rejected', 'refused'] as const)(
    'preserves processing and final insertion when delayed Stop is %s',
    async (outcome) => {
      let reply!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      mocks.sendRuntimeMessage.mockImplementation((message) => {
        if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP && !message.force)
          return new Promise((resolve, no) => {
            reply = resolve;
            reject = no;
          });
        return Promise.resolve({
          success: true,
          result: 'accepted',
          snapshot:
            message.type === MessageType.OFFSCREEN_VOICE_INPUT_START
              ? createSnapshot('offscreen-session-1', 'listening')
              : createSnapshot(null, 'idle'),
        });
      });
      const h = await createProcessingSessionFixture();
      h.owner.onMessage.emit({
        type: VoiceInputPortMessageType.STOP,
        requestId: 'held-stop',
        sessionId: 'client',
      });
      await flush();
      await h.transfer();
      if (outcome === 'rejected') reject(new Error('transport failed'));
      else if (outcome === 'refused') reply({ success: false });
      else
        reply({
          success: true,
          result: 'accepted',
          snapshot: {
            ...createSnapshot('offscreen-session-1', outcome),
            errorCode: outcome === 'error' ? 'offscreen-unavailable' : null,
          },
        });
      await flush();
      h.owner.onMessage.emit({
        type: VoiceInputPortMessageType.STATUS,
        requestId: 'after-transfer',
      });
      await flush();
      const observation = h.owner.postMessage.mock.calls.filter(
        ([event]) => event.requestId === 'after-transfer'
      );
      h.complete();
      await flush();
      expect(observation).toEqual([
        [
          expect.objectContaining({
            snapshot: expect.objectContaining({ phase: 'processing-asr', sessionId: 'client' }),
          }),
        ],
      ]);
      expect(h.owner.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'held-stop', type: VoiceInputPortMessageType.FAILURE })
      );
      expect(
        h.owner.postMessage.mock.calls.filter(
          ([event]) => event.type === VoiceInputPortMessageType.TRANSCRIPT
        )
      ).toEqual([[expect.objectContaining({ text: 'final', isFinal: true })]]);
      expect(mocks.sendRuntimeMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.OFFSCREEN_VOICE_INPUT_STOP, force: true })
      );
    }
  );
});

describe('queued capture cleanup after processing transfer', () => {
  it.each(['readiness', 'force', 'fallback-status'] as const)(
    'preserves processing when cleanup is suspended at %s',
    async (boundary) => {
      const scheduled: Array<() => void> = [];
      let resume!: (value?: unknown) => void;
      const pending = new Promise((resolve) => {
        resume = resolve;
      });
      mocks.sendRuntimeMessage.mockImplementation((message) => {
        if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_START)
          return Promise.resolve({
            success: true,
            snapshot: createSnapshot('offscreen-session-1', 'listening'),
          });
        if (message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP) {
          if (!message.force)
            return Promise.resolve({
              success: true,
              result: 'accepted',
              snapshot: createSnapshot('offscreen-session-1', 'stopping'),
            });
          if (boundary === 'force') return pending;
          if (boundary === 'fallback-status') return Promise.resolve({ success: false });
        }
        if (
          message.type === MessageType.OFFSCREEN_VOICE_INPUT_STATUS &&
          message.requestId.endsWith(':cleanup-status')
        )
          return pending;
        return Promise.resolve({
          success: true,
          result: 'accepted',
          snapshot: createSnapshot(null, 'idle'),
        });
      });
      const h = await createProcessingSessionFixture((callback) => scheduled.push(callback));
      h.owner.onMessage.emit({
        type: VoiceInputPortMessageType.STOP,
        requestId: 'stop',
        sessionId: 'client',
      });
      await flush();
      expect(scheduled).toHaveLength(1);
      if (boundary === 'readiness') mocks.waitForOffscreenReady.mockReturnValueOnce(pending);
      scheduled.shift()?.();
      await flush();
      await h.transfer();
      resume(
        boundary === 'readiness'
          ? undefined
          : { success: true, result: 'accepted', snapshot: createSnapshot(null, 'idle') }
      );
      await flush();
      h.owner.onMessage.emit({
        type: VoiceInputPortMessageType.STATUS,
        requestId: 'after-cleanup-race',
      });
      await flush();
      const observation = h.owner.postMessage.mock.calls.filter(
        ([event]) => event.requestId === 'after-cleanup-race'
      );
      h.complete();
      await flush();
      expect(observation).toEqual([
        [
          expect.objectContaining({
            snapshot: expect.objectContaining({ phase: 'processing-asr', sessionId: 'client' }),
          }),
        ],
      ]);
      expect(
        h.owner.postMessage.mock.calls.filter(
          ([event]) => event.type === VoiceInputPortMessageType.TRANSCRIPT
        )
      ).toEqual([[expect.objectContaining({ text: 'final', isFinal: true })]]);
      expect(
        mocks.sendRuntimeMessage.mock.calls.filter(
          ([message]) => message.type === MessageType.OFFSCREEN_VOICE_INPUT_STOP && message.force
        )
      ).toHaveLength(boundary === 'readiness' ? 0 : 1);
      expect(scheduled).toHaveLength(0);
    }
  );
  it.each(['cancel', 'privacy'] as const)(
    'preserves explicit %s cleanup after capture transfer',
    async (trigger) => {
      mocks.sendRuntimeMessage.mockImplementation(async (message) => ({
        success: true,
        result: 'accepted',
        snapshot:
          message.type === MessageType.OFFSCREEN_VOICE_INPUT_START
            ? createSnapshot('offscreen-session-1', 'listening')
            : createSnapshot(null, 'idle'),
      }));
      const h = await createProcessingSessionFixture();
      await h.transfer();
      let erasure: Promise<boolean> | undefined;
      if (trigger === 'privacy') erasure = h.coordinator.cleanupForPrivacyErasure();
      else
        h.owner.onMessage.emit({
          type: VoiceInputPortMessageType.CANCEL,
          requestId: 'cancel',
          sessionId: 'client',
        });
      h.complete();
      await flush();
      if (erasure) await expect(erasure).resolves.toBe(true);
      h.owner.onMessage.emit({
        type: VoiceInputPortMessageType.STATUS,
        requestId: 'after-explicit-cleanup',
      });
      await flush();
      expect(h.owner.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'after-explicit-cleanup',
          snapshot: expect.objectContaining({ phase: 'idle', sessionId: null }),
        })
      );
      expect(h.owner.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: VoiceInputPortMessageType.TRANSCRIPT })
      );
    }
  );
});
