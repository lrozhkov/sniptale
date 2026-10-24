import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceInputPortMessageType } from '@sniptale/runtime-contracts/voice-input';
import {
  inspectOffscreenMediaActivityOwner,
  resetOffscreenMediaActivityLeaseForTests,
} from '../media-activity/lease';
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
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY' })
    );
    expect(harness.createCapture).not.toHaveBeenCalled();
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
    modelStart(harness);
    await flushStart();
    harness.service.stop('s1', false);
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

describe('Chrome failure without audio retention', () => {
  it.each(['error', 'cancel'] as const)(
    'releases Chrome microphone after %s without recording audio',
    async (termination) => {
      const h = createHarness('unavailable');
      start(h.service);
      await flushStart();
      if (termination === 'error') h.recognitions[0]?.callbacks.onError('network');
      else h.service.stop('s1', true);
      await h.service.drain();
      expect(h.createCapture).not.toHaveBeenCalled();
      expect(h.normalizeAudio).not.toHaveBeenCalled();
      expect(h.publishAudio).not.toHaveBeenCalled();
      expect(h.releaseMicrophone).toHaveBeenCalledOnce();
      expect(h.service.getSnapshot()).toMatchObject(
        termination === 'error'
          ? { phase: 'error', errorCode: 'network' }
          : { phase: 'idle', sessionId: null }
      );
      expect(h.events).not.toContainEqual(
        expect.objectContaining({ type: 'VOICE_INPUT_CAPTURE_READY' })
      );
    }
  );
});

it('never records or stores Chrome audio while preserving the live final result', async () => {
  const h = createHarness();
  start(h.service);
  await flushStart();
  h.recognitions[0]?.callbacks.onResult(transcript('live final', true));
  h.service.stop('s1', false);
  h.recognitions[0]?.callbacks.onEnd();
  await h.service.drain();
  expect(h.createCapture).not.toHaveBeenCalled();
  expect(h.normalizeAudio).not.toHaveBeenCalled();
  expect(h.publishAudio).not.toHaveBeenCalled();
  expect(h.releaseMicrophone).toHaveBeenCalledOnce();
  expect(h.events).toContainEqual(
    expect.objectContaining({
      type: VoiceInputPortMessageType.TRANSCRIPT,
      text: 'live final',
      isFinal: true,
    })
  );
  expect(h.service.getSnapshot()).toMatchObject({ phase: 'ended', busyOwner: null });
});
