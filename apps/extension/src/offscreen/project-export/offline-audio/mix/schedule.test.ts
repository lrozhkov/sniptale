import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import { createAudioClipFromAsset } from '../../../../features/video/project/factories/clip';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const { clampClipPlaybackRateMock } = vi.hoisted(() => ({
  clampClipPlaybackRateMock: vi.fn((value) => value),
}));

vi.mock('../../../../features/video/project/timeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/project/timeline')>()),
  clampClipPlaybackRate: clampClipPlaybackRateMock,
}));

class FakeOfflineAudioContext {
  gains: Array<NonNullable<FakeOfflineAudioContext['lastGain']>> = [];
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
    this.gains.push(this.lastGain);
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

beforeEach(() => {
  vi.stubGlobal(
    'AudioBuffer',
    class {
      length: number;
      sampleRate: number;
      numberOfChannels: number;
      planes: Float32Array[];
      constructor(options: { length: number; sampleRate: number; numberOfChannels: number }) {
        Object.assign(this, options);
        this.length = options.length;
        this.sampleRate = options.sampleRate;
        this.numberOfChannels = options.numberOfChannels;
        this.planes = Array.from(
          { length: options.numberOfChannels },
          () => new Float32Array(options.length)
        );
      }
      getChannelData(c: number) {
        return this.planes[c]!;
      }
    }
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
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

  await scheduleOfflineAudioClipMix(context, clip as never, createAudioBuffer(2, 48_000, 4_800));

  expect(context.lastSource?.start).toHaveBeenCalledWith(1, 0, 1.2);
  expect(context.lastSource?.playbackRate.value).toBe(1);
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

  await scheduleOfflineAudioClipMix(context, clip as never, createAudioBuffer(2, 48_000, 4_800));

  expect(context.lastGain?.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  expect(context.lastGain?.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  expect(context.lastSource?.start).toHaveBeenCalledWith(0, 0, 1);
  expect(context.lastSource?.stop).toHaveBeenCalledWith(0);
});

it('prefers absolute audio gain fields when envelope values are absent', async () => {
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
    OfflineAudioContext;

  await scheduleOfflineAudioClipMix(
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

it.each(['LINEAR', 'EASE_IN_OUT'] as const)(
  'schedules %s crossfade at the retained phase of a partial export',
  async (easing) => {
    const { scheduleOfflineAudioClipMix } = await import('./schedule');
    const { getTransitionProgress } =
      await import('../../../../features/video/project/transition/runtime');
    const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
      OfflineAudioContext;
    await scheduleOfflineAudioClipMix(
      context,
      {
        duration: 0.5,
        startTime: 0,
        sourceStart: 0,
        sourceDuration: 0.5,
        volume: 1,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
        audioTransitions: [{ start: -0.25, end: 0.75, incoming: true, easing }],
      } as never,
      createAudioBuffer(1, 48000, 48000)
    );
    const automation = context.lastGain!.gain;
    expect(automation.setValueAtTime).toHaveBeenCalledWith(
      getTransitionProgress({ start: -0.25, end: 0.75, transition: { easing } }, 0),
      0
    );
    expect(automation.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      getTransitionProgress({ start: -0.25, end: 0.75, transition: { easing } }, 0.5),
      0.5
    );
  }
);

it('uses a separate attenuation stage before crossfade and preserves manual automation', async () => {
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
    OfflineAudioContext;
  const project = createEmptyVideoProject('Mix');
  const asset = createVideoProjectAsset(
    'Audio',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'local' },
    {
      width: 0,
      height: 0,
      duration: 4,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = {
    ...createAudioClipFromAsset(project.tracks[0]!.id, asset),
    volume: 0.8,
    volumeEnvelopeEnd: 0.5,
    originalAudioRanges: [
      { start: 1, end: 2, volume: 0.5 },
      { start: 2, end: 3, volume: 0.25 },
    ],
    audioTransitions: [{ start: 3, end: 4, incoming: false, easing: 'LINEAR' as const }],
  };
  await scheduleOfflineAudioClipMix(context, clip, createAudioBuffer(1, 48000, 192000));
  expect(context.gains).toHaveLength(3);
  const [manual, attenuation, transition] = context.gains;
  expect(manual?.connect).toHaveBeenCalledWith(attenuation);
  expect(attenuation?.connect).toHaveBeenCalledWith(transition);
  expect(transition?.connect).toHaveBeenCalledWith(context.destination);
  expect(attenuation?.gain.setValueAtTime.mock.calls).toEqual([
    [1, 0],
    [0.5, 1],
    [1, 2],
    [0.25, 2],
    [1, 3],
  ]);
  expect(attenuation?.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  expect(manual?.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 0);
  expect(manual?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.4, 4);
});
