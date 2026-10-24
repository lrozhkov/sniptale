import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VoiceInputPortMessageType,
  parseVoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import {
  acquireOffscreenMediaActivityLease,
  resetOffscreenMediaActivityLeaseForTests,
} from '../media-activity/lease';
import { createHarness, flushStart, start, transcript } from './service.test-support';

beforeEach(() => {
  vi.useRealTimers();
  resetOffscreenMediaActivityLeaseForTests();
});

afterEach(() => vi.useRealTimers());

describe('offscreen voice input service', () => {
  it('waits for audiostart even when the service starts and the microphone has a signal', async () => {
    const harness = createHarness('unavailable');
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onStart();
    harness.emitLevel(0.8);
    expect(harness.service.getSnapshot()).toMatchObject({
      phase: 'starting',
      effectiveMode: 'browser-managed',
    });
    harness.recognitions[0]?.callbacks.onAudioStart();
    expect(harness.service.getSnapshot().phase).toBe('listening');
  });

  it('ends browser-managed startup without claiming to listen when audiostart never arrives', async () => {
    vi.useFakeTimers();
    const harness = createHarness('unavailable');
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onStart();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.service.getSnapshot()).toMatchObject({ phase: 'error', errorCode: 'timeout' });
    expect(harness.events).not.toContainEqual(
      expect.objectContaining({ snapshot: expect.objectContaining({ phase: 'listening' }) })
    );
    expect(harness.releaseMicrophone).toHaveBeenCalledOnce();
  });

  it('uses processLocally=true only when the dictation package is available', async () => {
    const harness = createHarness('available');
    start(harness.service);
    await flushStart();

    expect(harness.recognitions).toHaveLength(1);
    expect(harness.recognitions[0]?.processLocally).toBe(true);
    expect(harness.recognitions[0]?.audioTrack).toBe(harness.selectedTrack);
    harness.recognitions[0]?.callbacks.onStart();
    harness.recognitions[0]?.callbacks.onAudioStart();
    harness.recognitions[0]?.callbacks.onResult(transcript('привет', true));
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        isFinal: true,
        sessionId: 's1',
        text: 'привет',
        type: VoiceInputPortMessageType.TRANSCRIPT,
      })
    );
  });

  it('acquires the selected microphone and emits only normalized level telemetry', async () => {
    const harness = createHarness('available');
    harness.service.start({
      captureToken: {
        entryId: 'entry',
        incarnation: 'incarnation',
        epoch: 'epoch',
        sequence: 1,
        createdAt: 1,
      },
      maxDurationMs: null,
      preferences: {
        language: 'ru-RU',
        microphoneDeviceId: 'microphone-2',
        mode: 'local-first',
      },
      requestId: 'request-selected',
      sessionId: 'selected-session',
    });
    await flushStart();
    expect(harness.acquireMicrophone).toHaveBeenCalledWith('microphone-2');
    harness.emitLevel(0.42);
    expect(harness.events).toContainEqual({
      level: 0.42,
      peaks: Array.from({ length: 16 }, () => 0.42),
      sessionId: 'selected-session',
      type: VoiceInputPortMessageType.AUDIO_LEVEL,
    });
    harness.recognitions[0]?.callbacks.onAudioStart();
    expect(harness.service.getSnapshot().phase).toBe('listening');
    expect(harness.service.stop('selected-session', false)).toBe('accepted');
    harness.recognitions[0]?.callbacks.onEnd();
    await flushStart();
    expect(harness.disposeLevelMonitor).toHaveBeenCalledOnce();
    expect(harness.releaseMicrophone).toHaveBeenCalledOnce();
  });

  it('continues recognition when microphone level visualization is unavailable', async () => {
    const harness = createHarness('available', { observeLevelThrows: true });
    start(harness.service);
    await flushStart();

    expect(harness.recognitions).toHaveLength(1);
    expect(harness.recognitions[0]?.processLocally).toBe(true);
  });

  it.each([
    ['denied', 'permission-denied'],
    ['device-busy', 'microphone-busy'],
    ['no-device', 'microphone-unavailable'],
    ['unavailable', 'microphone-unavailable'],
    ['unknown', 'unexpected'],
    ['raw', 'unexpected'],
  ] as const)('normalizes %s microphone acquisition failure', async (state, errorCode) => {
    const harness = createHarness('available', { acquireMicrophoneError: state });
    start(harness.service);
    await flushStart();

    expect(harness.recognitions).toHaveLength(0);
    expect(harness.service.getSnapshot()).toMatchObject({ errorCode, phase: 'error' });
    expect(harness.events).toContainEqual(
      expect.objectContaining({ errorCode, type: VoiceInputPortMessageType.FAILURE })
    );
  });

  it.each(['downloadable', 'downloading', 'unavailable'] as const)(
    'falls back to processLocally=false when dictation status is %s',
    async (availability) => {
      const harness = createHarness(availability);
      start(harness.service);
      await flushStart();

      expect(harness.recognitions).toHaveLength(1);
      expect(harness.recognitions[0]?.processLocally).toBe(false);
      expect(harness.service.getSnapshot()).toMatchObject({
        effectiveMode: 'browser-managed',
        fallbackReason: 'dictation-unavailable',
        localAvailability: availability,
      });
    }
  );

  it('distinguishes unsupported local APIs and pre-dictation Chromium fallback', async () => {
    const unsupported = createHarness('unsupported');
    start(unsupported.service);
    await flushStart();
    expect(unsupported.service.getSnapshot()).toMatchObject({
      fallbackReason: 'local-api-unsupported',
    });

    resetOffscreenMediaActivityLeaseForTests();
    const legacyQuality = createHarness('unavailable', { qualitySupported: false });
    start(legacyQuality.service);
    await flushStart();
    expect(legacyQuality.service.getSnapshot()).toMatchObject({
      fallbackReason: 'dictation-unsupported',
    });

    resetOffscreenMediaActivityLeaseForTests();
    const inconsistentQuality = createHarness('available', { qualitySupported: false });
    start(inconsistentQuality.service);
    await flushStart();
    expect(inconsistentQuality.recognitions[0]?.processLocally).toBe(false);
    expect(inconsistentQuality.service.getSnapshot()).toMatchObject({
      fallbackReason: 'dictation-unsupported',
    });
  });

  it('falls back when local availability rejects without exposing the exception', async () => {
    const harness = createHarness('available', { loadAvailabilityRejects: true });
    start(harness.service);
    await flushStart();

    expect(harness.recognitions[0]?.processLocally).toBe(false);
    expect(harness.service.getSnapshot()).toMatchObject({
      effectiveMode: 'browser-managed',
      fallbackReason: 'local-check-failed',
    });
  });

  it('skips local availability entirely in browser-managed mode', async () => {
    const harness = createHarness();
    harness.service.start({
      captureToken: {
        entryId: 'entry',
        incarnation: 'incarnation',
        epoch: 'epoch',
        sequence: 1,
        createdAt: 1,
      },
      maxDurationMs: null,
      preferences: { language: 'en-US', microphoneDeviceId: null, mode: 'browser-managed' },
      requestId: 'request-browser',
      sessionId: 'session-browser',
    });
    await flushStart();

    expect(harness.loadAvailability).not.toHaveBeenCalled();
    expect(harness.recognitions[0]?.processLocally).toBe(false);
  });

  it.each(['network', 'language-not-supported', 'service-not-allowed'])(
    'falls back once for local %s before any transcript',
    async (rawError) => {
      const harness = createHarness();
      start(harness.service);
      await flushStart();
      harness.recognitions[0]?.callbacks.onError(rawError);

      expect(harness.recognitions.map((entry) => entry.processLocally)).toEqual([true, false]);
      harness.recognitions[1]?.callbacks.onError(rawError);
      await harness.service.drain();
      expect(harness.recognitions).toHaveLength(2);
      expect(harness.service.getSnapshot()).toMatchObject({ errorCode: rawError, phase: 'error' });
    }
  );

  it('does not fall back for no-speech or after the first transcript event', async () => {
    const noSpeech = createHarness();
    start(noSpeech.service);
    await flushStart();
    noSpeech.recognitions[0]?.callbacks.onError('no-speech');
    await noSpeech.service.drain();
    expect(noSpeech.recognitions).toHaveLength(1);
    expect(noSpeech.service.getSnapshot()).toMatchObject({
      errorCode: 'no-speech',
      phase: 'error',
    });

    resetOffscreenMediaActivityLeaseForTests();
    const afterTranscript = createHarness();
    start(afterTranscript.service);
    await flushStart();
    afterTranscript.recognitions[0]?.callbacks.onResult(transcript('partial'));
    afterTranscript.recognitions[0]?.callbacks.onError('network');
    await afterTranscript.service.drain();
    expect(afterTranscript.recognitions).toHaveLength(1);
    expect(afterTranscript.service.getSnapshot()).toMatchObject({
      errorCode: 'network',
      phase: 'error',
    });
  });

  it.each([
    ['not-allowed', 'permission-denied'],
    ['audio-capture', 'microphone-unavailable'],
    ['aborted', 'aborted'],
    ['future-private-code', 'unexpected'],
  ] as const)('does not fall back for terminal %s errors', async (rawError, errorCode) => {
    const harness = createHarness();
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onError(rawError);
    await harness.service.drain();

    expect(harness.recognitions).toHaveLength(1);
    expect(harness.service.getSnapshot()).toMatchObject({ errorCode, phase: 'error' });
  });
});

describe('offscreen voice input lifecycle', () => {
  it('force-aborts synchronously for privacy erasure and reports verified idle', async () => {
    const harness = createHarness();
    start(harness.service);
    await flushStart();

    expect(harness.service.stop('s1', true)).toBe('accepted');
    expect(harness.recognitions[0]?.abort).toHaveBeenCalledOnce();
    expect(harness.service.getSnapshot()).toMatchObject({ phase: 'idle', sessionId: null });
    expect(harness.releaseMicrophone).toHaveBeenCalledOnce();
  });

  it('makes Stop terminal while local availability is still pending', async () => {
    let resolveAvailability: ((value: unknown) => void) | undefined;
    const harness = createHarness();
    harness.loadAvailability.mockReturnValue(
      new Promise((resolve) => {
        resolveAvailability = resolve;
      })
    );
    start(harness.service);
    await flushStart();

    expect(harness.service.stop('s1', false)).toBe('accepted');
    await flushStart();
    expect(harness.service.getSnapshot().phase).toBe('ended');
    resolveAvailability?.({
      apiFlavor: 'standard',
      availability: 'available',
      qualitySupported: true,
    });
    await flushStart();
    expect(harness.recognitions).toHaveLength(0);
  });

  it('releases a microphone acquired after the session was force-stopped', async () => {
    let resolveMicrophone:
      | ((value: { release(): void; track: MediaStreamTrack }) => void)
      | undefined;
    const harness = createHarness();
    harness.acquireMicrophone.mockReturnValue(
      new Promise((resolve) => {
        resolveMicrophone = resolve;
      })
    );
    start(harness.service);
    expect(harness.service.stop('s1', true)).toBe('accepted');
    resolveMicrophone?.({ release: harness.releaseMicrophone, track: harness.selectedTrack });
    await flushStart();

    expect(harness.releaseMicrophone).toHaveBeenCalledOnce();
    expect(harness.recognitions).toHaveLength(0);
  });

  it('recovers an unexpected early end inside the bounded session', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onAudioStart();
    harness.recognitions[0]?.callbacks.onEnd();
    await flushStart();
    await vi.advanceTimersByTimeAsync(249);
    expect(harness.recognitions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.recognitions).toHaveLength(2);
    expect(harness.service.getSnapshot()).toMatchObject({ phase: 'listening', sessionId: 's1' });
    vi.useRealTimers();
  });

  it('stops manually and waits for end without auto-restart', async () => {
    const harness = createHarness();
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onStart();

    expect(harness.service.stop('s1', false)).toBe('accepted');
    expect(harness.recognitions[0]?.stop).toHaveBeenCalledOnce();
    harness.recognitions[0]?.callbacks.onEnd();
    await flushStart();
    expect(harness.service.getSnapshot()).toMatchObject({ phase: 'ended', sessionId: 's1' });
    expect(harness.recognitions).toHaveLength(1);
  });

  it('does not fall back when a local recognizer reports an eligible error after Stop', async () => {
    const harness = createHarness();
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onStart();

    expect(harness.service.stop('s1', false)).toBe('accepted');
    harness.recognitions[0]?.callbacks.onError('network');

    expect(harness.recognitions).toHaveLength(1);
    expect(harness.service.getSnapshot().phase).toBe('stopping');
    harness.recognitions[0]?.callbacks.onEnd();
    await flushStart();
    expect(harness.service.getSnapshot().phase).toBe('ended');
  });

  it('falls back once on local start timeout and terminates the browser-managed retry', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    start(harness.service);
    await flushStart();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.recognitions.map((entry) => entry.processLocally)).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.recognitions).toHaveLength(2);
    expect(harness.service.getSnapshot()).toMatchObject({ errorCode: 'timeout', phase: 'error' });
    vi.useRealTimers();
  });

  it('falls back once after a synchronous local start failure', async () => {
    const harness = createHarness('available', { startThrowsFor: [0] });
    start(harness.service);
    await flushStart();

    expect(harness.recognitions.map((entry) => entry.processLocally)).toEqual([true, false]);
    expect(harness.service.getSnapshot()).toMatchObject({
      effectiveMode: 'browser-managed',
      fallbackReason: 'local-start-failed',
    });
  });

  it('reports unsupported after a synchronous browser-managed start failure', async () => {
    const harness = createHarness('available', { startThrowsFor: [0] });
    harness.service.start({
      captureToken: {
        entryId: 'entry',
        incarnation: 'incarnation',
        epoch: 'epoch',
        sequence: 1,
        createdAt: 1,
      },
      maxDurationMs: null,
      preferences: { language: 'ru-RU', microphoneDeviceId: null, mode: 'browser-managed' },
      requestId: 'request-browser',
      sessionId: 'session-browser',
    });
    await flushStart();
    expect(harness.service.getSnapshot()).toMatchObject({
      errorCode: 'unsupported',
      phase: 'error',
    });
  });

  it('forces abort after the graceful stop deadline', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onStart();
    harness.service.stop('s1', false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(harness.recognitions[0]?.abort).toHaveBeenCalledOnce();
    expect(harness.service.getSnapshot().phase).toBe('ended');
    vi.useRealTimers();
  });

  it('finishes immediately when browser stop throws and tolerates a completed abort', async () => {
    const harness = createHarness('available', { abortThrows: true, stopThrows: true });
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onStart();

    expect(harness.service.stop('s1', false)).toBe('accepted');
    await flushStart();
    expect(harness.service.getSnapshot().phase).toBe('ended');
  });

  it('stops cleanly at the 30-second test limit', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    start(harness.service, 's1', 30_000);
    await flushStart();
    harness.recognitions[0]?.callbacks.onStart();
    harness.recognitions[0]?.callbacks.onAudioStart();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(harness.recognitions[0]?.stop).toHaveBeenCalledOnce();
    expect(harness.service.getSnapshot()).toMatchObject({ errorCode: null, phase: 'stopping' });
    harness.recognitions[0]?.callbacks.onEnd();
    await flushStart();
    expect(harness.service.getSnapshot()).toMatchObject({ errorCode: null, phase: 'ended' });
  });

  it('keeps an unlimited consumer listening beyond the Settings test deadline', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    start(harness.service);
    await flushStart();
    harness.recognitions[0]?.callbacks.onStart();
    harness.recognitions[0]?.callbacks.onAudioStart();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(harness.recognitions[0]?.stop).not.toHaveBeenCalled();
    expect(harness.service.getSnapshot()).toMatchObject({ phase: 'listening', sessionId: 's1' });
  });
});

describe('offscreen voice input media ownership', () => {
  it('reports the video lease conflict without creating recognition', () => {
    const video = acquireOffscreenMediaActivityLease('video-recording');
    const harness = createHarness();
    const rejection = start(harness.service);

    expect(harness.recognitions).toHaveLength(0);
    expect(rejection).toMatchObject({
      errorCode: 'busy-video',
      phase: 'error',
      sessionId: 's1',
    });
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        errorCode: 'busy-video',
        type: VoiceInputPortMessageType.FAILURE,
      })
    );
    if (video.acquired) video.lease.release();
  });

  it('rejects concurrent speech and privacy-erasure leases with stable codes', async () => {
    const speech = createHarness();
    start(speech.service);
    await flushStart();
    start(speech.service, 's2');
    expect(speech.events).toContainEqual(expect.objectContaining({ errorCode: 'busy-speech' }));
    expect(speech.service.stop('missing', false)).toBe('stale');
    speech.service.abortOnUnload();
    expect(speech.recognitions[0]?.abort).toHaveBeenCalledOnce();

    resetOffscreenMediaActivityLeaseForTests();
    const privacy = acquireOffscreenMediaActivityLease('privacy-erasure');
    const blocked = createHarness();
    start(blocked.service);
    expect(blocked.events).toContainEqual(
      expect.objectContaining({ errorCode: 'privacy-erasure-in-progress' })
    );
    if (privacy.acquired) privacy.lease.release();

    resetOffscreenMediaActivityLeaseForTests();
    const externalSpeech = acquireOffscreenMediaActivityLease('speech-recognition');
    const speechBlocked = createHarness('available', { emitRejects: true });
    start(speechBlocked.service);
    await flushStart();
    expect(speechBlocked.events).toContainEqual(
      expect.objectContaining({ errorCode: 'busy-speech' })
    );
    if (externalSpeech.acquired) externalSpeech.lease.release();
  });

  it('reports a desktop screenshot lease through the typed voice snapshot boundary', () => {
    const desktopScreenshot = acquireOffscreenMediaActivityLease('desktop-screenshot');
    const harness = createHarness();

    const busySnapshot = start(harness.service, 'desktop-busy');

    expect(busySnapshot).toMatchObject({
      busyOwner: 'video-recording',
      errorCode: 'busy-video',
      phase: 'error',
    });
    expect(parseVoiceInputSnapshot(busySnapshot)).toEqual(busySnapshot);
    if (desktopScreenshot.acquired) desktopScreenshot.lease.release();
  });

  it('contains transport rejection and ignores callbacks from a finished generation', async () => {
    const harness = createHarness('available', { emitRejects: true });
    start(harness.service);
    await flushStart();
    const first = harness.recognitions[0]!;
    expect(harness.service.stop('s1', false)).toBe('accepted');
    first.callbacks.onEnd();
    first.callbacks.onResult(transcript('late'));
    await flushStart();

    expect(harness.service.getSnapshot().phase).toBe('error');
    expect(harness.events).not.toContainEqual(expect.objectContaining({ text: 'late' }));
  });
});

describe('voice input Stop final result', () => {
  it('delivers the final recognition result produced by Stop before ending', async () => {
    const harness = createHarness('available');
    start(harness.service);
    await flushStart();
    harness.service.stop('s1', false);
    harness.recognitions[0]?.callbacks.onResult(transcript('last words', true));
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        type: VoiceInputPortMessageType.TRANSCRIPT,
        text: 'last words',
        isFinal: true,
      })
    );
  });
});
