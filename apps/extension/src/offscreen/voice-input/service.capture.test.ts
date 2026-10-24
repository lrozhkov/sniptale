import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import {
  inspectOffscreenMediaActivityOwner,
  resetOffscreenMediaActivityLeaseForTests,
} from '../media-activity/lease';
import { createHistoryFixture } from '../../composition/persistence/voice-input-history/test-support';
import { createHarness, flushStart, start, transcript } from './service.test-support';

beforeEach(() => resetOffscreenMediaActivityLeaseForTests());
afterEach(() => vi.useRealTimers());

function modelStart(harness: ReturnType<typeof createHarness>, correction = false) {
  return harness.service.start({
    captureToken: {
      entryId: 'entry',
      incarnation: 'incarnation',
      epoch: 'epoch',
      sequence: 1,
      createdAt: 1,
    },
    maxDurationMs: null,
    requestId: 'start',
    sessionId: 's1',
    preferences: {
      language: 'ru-RU',
      microphoneDeviceId: null,
      mode: 'local-first',
      backend: correction ? 'browser' : 'model',
      correction: { enabled: correction, model: null },
    },
  });
}

describe('voice capture publication lifecycle', () => {
  it('releases borrowed microphone and lease before normalization and storage', async () => {
    const harness = createHarness();
    harness.normalizeAudio.mockImplementation(async (input) => {
      expect(harness.releaseMicrophone).toHaveBeenCalledOnce();
      expect(inspectOffscreenMediaActivityOwner()).toBeNull();
      expect(harness.events).toContainEqual({
        type: 'VOICE_INPUT_CAPTURE_RELEASED',
        sessionId: 's1',
      });
      return input;
    });
    modelStart(harness);
    await flushStart();
    expect(harness.recognitions).toHaveLength(0);
    harness.service.stop('s1', false);
    await flushStart();
    expect(harness.publishAudio).toHaveBeenCalledOnce();
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY', rawTranscript: null })
    );
  });
  it('preserves original WebM on normalization failure and reports its duration estimate', async () => {
    const harness = createHarness();
    harness.normalizeAudio.mockRejectedValue(new Error('decode-failed'));
    modelStart(harness);
    await flushStart();
    harness.service.stop('s1', false);
    await flushStart();
    expect(harness.publishAudio).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        audio: expect.objectContaining({ type: 'audio/webm' }),
        durationSeconds: 1,
        backend: 'model',
      }),
      expect.any(AbortSignal)
    );
  });
  it('streams Chrome despite saved correction and retains the final result after Stop', async () => {
    const harness = createHarness();
    modelStart(harness, true);
    await flushStart();
    harness.recognitions[0]?.callbacks.onResult(transcript('interim'));
    harness.recognitions[0]?.callbacks.onResult(transcript('first', true));
    harness.service.stop('s1', false);
    harness.recognitions[0]?.callbacks.onResult(transcript('last', true));
    harness.recognitions[0]?.callbacks.onEnd();
    await flushStart();
    expect(
      harness.events
        .filter((event) => event.type === VoiceInputPortMessageType.TRANSCRIPT)
        .map((event) => event.text)
    ).toEqual(['interim', 'first', 'last']);
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY', rawTranscript: 'first last' })
    );
  });
  it('cancels and drains pending normalization before reporting privacy cleanup complete', async () => {
    const harness = createHarness();
    let release!: () => void;
    harness.normalizeAudio.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          release = () => resolve(input);
        })
    );
    modelStart(harness);
    await flushStart();
    harness.service.stop('s1', false);
    await flushStart();
    expect(harness.service.stop('s1', true)).toBe('accepted');
    let settled = false;
    const drain = harness.service.drain().then(() => {
      settled = true;
    });
    await flushStart();
    expect(settled).toBe(false);
    release();
    await drain;
    expect(harness.publishAudio).not.toHaveBeenCalled();
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY' })
    );
  });
  it('does not apply the recognition Stop grace timer to pending audio normalization', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    let release!: () => void;
    harness.normalizeAudio.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          release = () => resolve(input);
        })
    );
    start(harness.service);
    await flushStart();
    harness.service.stop('s1', false);
    harness.recognitions[0]?.callbacks.onEnd();
    await flushStart();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.service.getSnapshot().phase).toBe('stopping');
    release();
    await harness.service.drain();
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY' })
    );
  });
});

describe('audio retention after Chrome recognition failure', () => {
  it('retains usable captured audio for explicit retry and emits only the original network error', async () => {
    const history = createHistoryFixture().create();
    await history.initialize();
    const captureToken = await history.beginCapture();
    const h = createHarness('unavailable');
    h.publishAudio.mockImplementation((token, input, signal) =>
      history.publishAudio(token, input, signal)
    );
    h.normalizeAudio.mockImplementation(async (input) => {
      expect(h.releaseMicrophone).toHaveBeenCalledOnce();
      expect(inspectOffscreenMediaActivityOwner()).toBeNull();
      return input;
    });
    h.service.start({
      captureToken,
      maxDurationMs: null,
      requestId: 'start',
      sessionId: 's1',
      preferences: { language: 'ru-RU', microphoneDeviceId: null, mode: 'browser-managed' },
    });
    await flushStart();
    h.recognitions[0]?.callbacks.onAudioStart();
    h.emitLevel(0.6);
    h.recognitions[0]?.callbacks.onError('network');
    await h.service.drain();
    const entries = await history.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      status: 'recorded',
      backend: 'browser',
      mimeType: 'audio/webm',
      byteLength: 5,
    });
    expect(h.service.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'network' });
    expect(h.events).toContainEqual(
      expect.objectContaining({ type: VoiceInputPortMessageType.FAILURE, errorCode: 'network' })
    );
    expect(h.events).not.toContainEqual(
      expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY' })
    );
  });
  it.each(['zero', 'encoder'] as const)(
    'keeps the original error when captured audio is %s',
    async (invalid) => {
      const h = createHarness('unavailable');
      start(h.service);
      await flushStart();
      const capture = h.createCapture.mock.results[0]!.value;
      if (invalid === 'zero')
        capture.finish.mockResolvedValue({ audio: new Blob([]), durationSeconds: 0 });
      else capture.finish.mockRejectedValue(new Error('encoder failed'));
      h.recognitions[0]?.callbacks.onError('network');
      await h.service.drain();
      expect(h.publishAudio).not.toHaveBeenCalled();
      expect(h.normalizeAudio).not.toHaveBeenCalled();
      expect(h.service.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'network' });
      expect(h.releaseMicrophone).toHaveBeenCalledOnce();
      expect(h.events).not.toContainEqual(
        expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY' })
      );
    }
  );
  it.each(['finish', 'normalize', 'publish'] as const)(
    'cancels and drains error finalization during %s',
    async (boundary) => {
      const h = createHarness('unavailable');
      start(h.service);
      await flushStart();
      const capture = h.createCapture.mock.results[0]!.value;
      let resume!: () => void;
      const pending = new Promise<void>((resolve) => {
        resume = resolve;
      });
      if (boundary === 'finish')
        capture.finish.mockImplementation(async () => {
          await pending;
          return { audio: new Blob(['audio'], { type: 'audio/webm' }), durationSeconds: 1 };
        });
      if (boundary === 'normalize')
        h.normalizeAudio.mockImplementation(async (input) => {
          await pending;
          return input;
        });
      if (boundary === 'publish')
        h.publishAudio.mockImplementation(async (_token, _input, signal) => {
          await pending;
          signal?.throwIfAborted();
          return {
            entryId: 'entry',
            incarnation: 'incarnation',
            epoch: 'epoch',
            revision: 1,
            audioDigest: 'sha256:' + 'a'.repeat(64),
          };
        });
      h.recognitions[0]?.callbacks.onError('network');
      await flushStart();
      expect(capture.finish).toHaveBeenCalledOnce();
      if (boundary === 'normalize') expect(h.normalizeAudio).toHaveBeenCalledOnce();
      if (boundary === 'publish') expect(h.publishAudio).toHaveBeenCalledOnce();
      expect(h.service.stop('s1', true)).toBe('accepted');
      let settled = false;
      const drain = h.service.drain().then(() => {
        settled = true;
      });
      await flushStart();
      expect(settled).toBe(false);
      resume();
      await drain;
      if (boundary !== 'publish') expect(h.publishAudio).not.toHaveBeenCalled();
      expect(h.service.getSnapshot()).toMatchObject({ phase: 'idle', sessionId: null });
      expect(h.events).not.toContainEqual(
        expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY' })
      );
      expect(h.events).not.toContainEqual(
        expect.objectContaining({ type: VoiceInputPortMessageType.FAILURE })
      );
    }
  );
});
