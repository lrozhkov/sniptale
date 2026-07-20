import { afterEach, expect, it, vi } from 'vitest';

const { clampClipPlaybackRateMock } = vi.hoisted(() => ({
  clampClipPlaybackRateMock: vi.fn((value) => value),
}));

vi.mock('../../../../features/video/project/timeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/project/timeline')>()),
  clampClipPlaybackRate: clampClipPlaybackRateMock,
}));

class FakeOfflineAudioContext {
  destination = { id: 'destination' };
  lastGain: null | {
    connect: ReturnType<typeof vi.fn>;
    gain: {
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      setValueAtTime: ReturnType<typeof vi.fn>;
    };
  } = null;
  lastSource: null | {
    buffer: AudioBuffer | null;
    connect: ReturnType<typeof vi.fn>;
    playbackRate: {
      value: number;
    };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  } = null;

  createBufferSource() {
    this.lastSource = {
      buffer: null,
      connect: vi.fn(),
      playbackRate: { value: 1 },
      start: vi.fn(),
      stop: vi.fn(),
    };
    return this.lastSource;
  }

  createGain() {
    this.lastGain = {
      connect: vi.fn(),
      gain: {
        linearRampToValueAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
    };
    return this.lastGain;
  }
}

function createAudioBuffer(channels: number, sampleRate: number, length: number) {
  const channelData = Array.from({ length: channels }, () => new Float32Array(length).fill(0.5));
  return {
    length,
    numberOfChannels: channels,
    sampleRate,
    getChannelData: (channel: number) => channelData[channel],
  } as AudioBuffer;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

it('schedules fades and playback bounds for an offline mix clip', async () => {
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
    OfflineAudioContext;
  const clip = {
    duration: 2,
    fadeInMs: 100,
    fadeOutMs: 150,
    muted: false,
    playbackRate: 1.25,
    sourceDuration: 1.5,
    sourceStart: 0.25,
    startTime: 1,
    volume: 0.75,
    volumeEnvelopeEnd: 0.5,
    volumeEnvelopeStart: 1,
  };

  scheduleOfflineAudioClipMix(context, clip as never, createAudioBuffer(2, 48_000, 4_800));

  expect(context.lastSource?.start).toHaveBeenCalledWith(1, 0.25, 1.5);
  expect(context.lastSource?.playbackRate.value).toBe(1.25);
  expect(clampClipPlaybackRateMock).toHaveBeenCalledWith(1.25);
  expect(context.lastSource?.stop).toHaveBeenCalledWith(3);
  expect(context.lastGain?.gain.setValueAtTime).toHaveBeenCalledWith(0, 1);
  expect(context.lastGain?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.73125, 1.1);
  expect(context.lastGain?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
    0.40312499999999996,
    2.85
  );
});

it('uses immediate gain changes for muted clips without fades', async () => {
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
    OfflineAudioContext;
  const clip = {
    duration: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    muted: true,
    sourceDuration: 1,
    sourceStart: 0,
    startTime: -2,
    volume: -1,
    volumeEnvelopeEnd: 0.5,
    volumeEnvelopeStart: 1.5,
  };

  scheduleOfflineAudioClipMix(context, clip as never, createAudioBuffer(2, 48_000, 4_800));

  expect(context.lastGain?.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  expect(context.lastGain?.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  expect(context.lastSource?.start).toHaveBeenCalledWith(0, 0, 1);
  expect(context.lastSource?.stop).toHaveBeenCalledWith(0);
});

it('prefers absolute audio gain fields when envelope values are absent', async () => {
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
    OfflineAudioContext;

  scheduleOfflineAudioClipMix(
    context,
    {
      audioGainEnd: 0.25,
      audioGainStart: 1.5,
      duration: 2,
      fadeInMs: 0,
      fadeOutMs: 0,
      muted: false,
      sourceDuration: 2,
      sourceStart: 0.5,
      startTime: 0.5,
      volume: 1,
    } as never,
    createAudioBuffer(2, 48_000, 4_800)
  );

  expect(context.lastGain?.gain.setValueAtTime).toHaveBeenCalledWith(1.5, 0.5);
  expect(context.lastGain?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, 2.5);
});
