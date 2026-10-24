import { describe, expect, it, vi } from 'vitest';
import {
  VoiceInputPortMessageType,
  type VoiceInputCaptureEvent,
} from '@sniptale/runtime-contracts/voice-input';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import {
  createHistoryFixture,
  recording,
  deferred,
} from '../../composition/persistence/voice-input-history/test-support';
import { createVoiceInputCaptureCompletion } from './capture-completion';
import { VoiceInputSessionAuthority } from './session-authority';
import { createIdleVoiceInputSnapshot, type ActiveVoiceInputSession } from './protocol';
import type { VoiceInputProcessingOperations } from './processing-operation';

async function harness(backend: 'browser' | 'model' = 'model') {
  const history = createHistoryFixture().create();
  await history.initialize();
  const captureToken = await history.beginCapture();
  const scope = await history.publishAudio(captureToken, { ...recording(), backend });
  const owner = createRuntimePortFixture({});
  const session: ActiveVoiceInputSession = {
    port: owner.port,
    documentId: 'document',
    consumerId: 'scenario-editor',
    maxDurationMs: null,
    sessionId: 'client-session',
    offscreenSessionId: 'private-session',
    preferences: { backend, language: 'ru-RU', mode: 'local-first', microphoneDeviceId: null },
    captureToken,
    offscreenObserved: true,
    startRollbackPending: false,
    stopCleanupPending: false,
  };
  const sessions = new VoiceInputSessionAuthority();
  sessions.begin(session, {
    ...createIdleVoiceInputSnapshot(session.preferences),
    sessionId: session.sessionId,
    phase: 'stopping',
  });
  const run = vi.fn<VoiceInputProcessingOperations['run']>();
  const processing = { run, cancelOwner: vi.fn(), cancelScope: vi.fn(), abortAndDrain: vi.fn() };
  const completion = createVoiceInputCaptureCompletion({ history, sessions, processing });
  const ready: Extract<VoiceInputCaptureEvent, { type: 'VOICE_INPUT_CAPTURE_READY' }> = {
    type: 'VOICE_INPUT_CAPTURE_READY',
    sessionId: 'private-session',
    scope,
    rawTranscript: null,
    durationSeconds: 1,
  };
  return { history, sessions, session, scope, run, owner, completion, ready };
}

describe('private capture admission and final delivery', () => {
  it('requires matching release, durable identity, backend/language and duration before processing', async () => {
    const h = await harness();
    await h.completion.handle(h.ready);
    expect(h.run).not.toHaveBeenCalled();
    await h.completion.handle({
      type: 'VOICE_INPUT_CAPTURE_RELEASED',
      sessionId: 'private-session',
    });
    await h.completion.handle({ ...h.ready, durationSeconds: 1.1 });
    expect(h.run).not.toHaveBeenCalled();
    expect(h.owner.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: VoiceInputPortMessageType.FAILURE, errorCode: 'stale' })
    );
  });
  it.each(['language', 'token', 'model-raw'] as const)(
    'refuses mismatched capture %s before ASR',
    async (mismatch) => {
      const h = await harness();
      if (mismatch === 'language') h.session.preferences.language = 'en-US';
      if (mismatch === 'token' && h.session.captureToken)
        h.session.captureToken.incarnation = 'different';
      await h.completion.handle({
        type: 'VOICE_INPUT_CAPTURE_RELEASED',
        sessionId: 'private-session',
      });
      await h.completion.handle(
        mismatch === 'model-raw' ? { ...h.ready, rawTranscript: 'must not bypass ASR' } : h.ready
      );
      expect(h.run).not.toHaveBeenCalled();
      expect(h.owner.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: 'stale' })
      );
    }
  );
  it('emits exactly one final for model completion and excludes private capture events', async () => {
    const h = await harness();
    h.run.mockImplementation(async (args) => {
      args.onPhase?.('processing-asr', args.scope);
      return h.history.complete(args.scope, {
        rawTranscript: 'raw',
        transcript: 'final',
        correctionStatus: 'applied',
      });
    });
    await h.completion.handle({
      type: 'VOICE_INPUT_CAPTURE_RELEASED',
      sessionId: 'private-session',
    });
    await h.completion.handle(h.ready);
    await h.completion.handle(h.ready);
    expect(
      h.owner.postMessage.mock.calls.filter(
        ([event]) => event.type === VoiceInputPortMessageType.TRANSCRIPT
      )
    ).toEqual([
      [
        {
          type: VoiceInputPortMessageType.TRANSCRIPT,
          text: 'final',
          sequence: 1,
          confidence: null,
          isFinal: true,
          sessionId: 'client-session',
        },
      ],
    ]);
    expect(h.owner.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY' })
    );
    expect(h.sessions.active).toBeNull();
  });
  it('ignores capture completion in Chrome without processing or storing streamed text', async () => {
    const h = await harness();
    h.session.preferences.backend = 'browser';
    delete h.session.captureToken;
    const original = await h.history.list();
    await h.completion.handle({
      type: 'VOICE_INPUT_CAPTURE_RELEASED',
      sessionId: 'private-session',
    });
    await h.completion.handle({ ...h.ready, rawTranscript: 'streamed' });
    expect(h.run).not.toHaveBeenCalled();
    expect(await h.history.list()).toEqual(original);
    expect(h.owner.postMessage).not.toHaveBeenCalled();
  });
  it('never inserts processing results after cancellation or session replacement', async () => {
    const h = await harness();
    const pending = deferred();
    h.run.mockImplementation(async (args) => {
      await pending.promise;
      return h.history.complete(args.scope, {
        rawTranscript: 'late',
        transcript: 'late',
        correctionStatus: 'off',
      });
    });
    await h.completion.handle({
      type: 'VOICE_INPUT_CAPTURE_RELEASED',
      sessionId: 'private-session',
    });
    const work = h.completion.handle(h.ready);
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    h.session.cancelled = true;
    pending.resolve();
    await work;
    expect(h.owner.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: VoiceInputPortMessageType.TRANSCRIPT })
    );
  });
});
