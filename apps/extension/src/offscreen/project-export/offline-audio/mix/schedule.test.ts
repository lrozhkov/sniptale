import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
} from '../../../../features/video/project/factories/clip';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const { clampClipPlaybackRateMock } = vi.hoisted(() => ({
  clampClipPlaybackRateMock: vi.fn((value) => value),
}));

vi.mock('../../../../features/video/project/timeline', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../features/video/project/timeline')>();
  clampClipPlaybackRateMock.mockImplementation(actual.clampClipPlaybackRate);
  return { ...actual, clampClipPlaybackRate: clampClipPlaybackRateMock };
});

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
  expect(context.gains).toHaveLength(2);
  const [manual, fade] = context.gains;
  expect(manual?.connect).toHaveBeenCalledWith(fade);
  expect(manual?.gain.setValueAtTime).toHaveBeenCalledWith(0.75, 1);
  expect(manual?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.375, 3);
  expect(fade?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 1.1);
  expect(fade?.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 3);
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

it.each([0.0625, 0.125, 0.5, 8, 16])(
  'uses the real clip rate %s for prepared PCM and offline source scheduling',
  async (rate) => {
    const { scheduleOfflineAudioClipMix } = await import('./schedule');
    const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
      OfflineAudioContext;
    const project = createEmptyVideoProject('Exact rate');
    const asset = createVideoProjectAsset(
      'Audio',
      'AUDIO',
      { kind: 'project-asset', projectAssetId: 'local' },
      {
        width: 0,
        height: 0,
        duration: 0.1,
        mimeType: 'audio/wav',
        size: 1,
        hasAudio: true,
        audioPeaks: null,
      }
    );
    const clip = {
      ...createAudioClipFromAsset(project.tracks[0]!.id, asset),
      startTime: 1,
      sourceStart: 0.02,
      sourceDuration: 0.04,
      duration: 0.04 / rate,
      playbackRate: rate,
    };
    await scheduleOfflineAudioClipMix(context, clip, createAudioBuffer(1, 48000, 4800));
    expect(context.lastSource?.buffer?.length).toBe(Math.round((0.04 / rate) * 48000));
    expect(context.lastSource?.start).toHaveBeenCalledWith(1, 0, 0.04 / rate);
    expect(context.lastSource?.stop).toHaveBeenCalledWith(1 + 0.04 / rate);
  }
);

it('schedules source amplification from the actual collector with each master applied once', async () => {
  const { collectRenderableAudioClips } = await import('../clip-audio/collect');
  const { createVideoProjectTrack } =
    await import('../../../../features/video/project/factories/creation');
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const project = createEmptyVideoProject('Source gain');
  const track = createVideoProjectTrack('Audio', 1, 'AUDIO');
  track.audioVolume = 2;
  const asset = createVideoProjectAsset(
    'Source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'source' },
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
  const clip = createAudioClipFromAsset(track.id, asset);
  clip.audioGainStart = clip.audioGainEnd = 2;
  project.tracks = [track];
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 4;
  project.sourceAudioDocuments = [
    {
      id: 'envelope',
      binding: {
        kind: 'source',
        assetId: asset.id,
        sourceInstanceId: clip.sourceInstanceId ?? clip.id,
      },
      ranges: [{ id: 'boost', start: 0, end: 4, volume: 2 }],
      mutes: [{ id: 'static', start: 1, end: 2, volume: 0.25 }],
    },
  ];
  for (const settings of [undefined, { rangeStartSeconds: 0.5, rangeEndSeconds: 2.5 }]) {
    const prepared = collectRenderableAudioClips(project, settings)[0]!;
    const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
      OfflineAudioContext;
    await scheduleOfflineAudioClipMix(context, prepared, createAudioBuffer(1, 48000, 192000));
    expect(context.gains).toHaveLength(2);
    const [masters, source] = context.gains;
    expect(masters?.gain.setValueAtTime).toHaveBeenCalledWith(4, 0);
    expect(source?.gain.setValueAtTime.mock.calls).toEqual(
      settings
        ? [
            [1, 0],
            [2, 0],
            [1, 0.5],
            [0.5, 0.5],
            [1, 1.5],
            [2, 1.5],
            [1, 2],
          ]
        : [
            [1, 0],
            [2, 0],
            [1, 1],
            [0.5, 1],
            [1, 2],
            [2, 2],
            [1, 4],
          ]
    );
  }
});

it.each([0.25, 1, 4])(
  'preserves shared waveform and padding after selected-range seek at tempo %s',
  async (rate) => {
    const { scheduleOfflineAudioClipMix } = await import('./schedule');
    const { createReviewAudioClipRenderer, REVIEW_AUDIO_CLIP_PADDING_SECONDS } =
      await import('../../../../workflows/video-review/audio-clip-render');
    const { clipAudioClipToExportRange } = await import('../clip-audio/collect');
    const buffer = createAudioBuffer(1, 8_000, 64_000);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++)
      data[index] = Math.sin(index * 0.037) * Math.sin(index * 0.0011);
    const entry = {
      lane: 'voiceover' as const,
      clipId: 'take',
      source: { kind: 'project' as const, assetId: 'voice' },
      timelineStart: 0,
      duration: 1.5,
      sourceOffset: 0.37,
      volume: 0.8,
      fadeIn: 0.3,
      fadeOut: 0.4,
      playbackRate: rate,
      fadePhase: { offset: 0.2, duration: 7 },
    };
    const clip: import('../clip-audio/types').OfflineAudioRenderableClip = {
      sourceKind: 'source-voiceover',
      playbackEntry: entry,
      id: 'take',
      assetId: 'voice',
      startTime: 0,
      duration: entry.duration,
      sourceStart: entry.sourceOffset,
      sourceDuration: entry.duration * rate,
      playbackRate: rate,
      volume: entry.volume,
      muted: false,
      fadeInMs: (entry.fadeIn / rate) * 1000,
      fadeOutMs: (entry.fadeOut / rate) * 1000,
      audioFadePhase: { offset: 0.2 / rate, duration: 7 / rate },
    };
    const range = clipAudioClipToExportRange(clip, { start: 0.5, end: 1.25 });
    if (!range) throw new Error('Missing range');
    const context = new FakeOfflineAudioContext() as FakeOfflineAudioContext & OfflineAudioContext;
    await scheduleOfflineAudioClipMix(context, range, buffer);
    const source = context.lastSource;
    if (!source?.buffer) throw new Error('Missing scheduled buffer');
    const padding = Math.round(buffer.sampleRate * REVIEW_AUDIO_CLIP_PADDING_SECONDS);
    expect(source.start).toHaveBeenCalledWith(
      0,
      rate === 1 ? entry.sourceOffset + 0.5 : padding / buffer.sampleRate,
      0.75
    );
    expect(source.stop).toHaveBeenCalledWith(0.75);
    if (rate === 1) expect(source.buffer).toBe(buffer);
    else {
      const whole = await createReviewAudioClipRenderer().render(
        entry,
        buffer,
        0,
        entry.duration,
        new AbortController().signal
      );
      const expected = whole.getChannelData(0).subarray(padding + 4_000, padding + 10_000);
      const actual = source.buffer.getChannelData(0).subarray(padding, padding + 6_000);
      let maximum = 0;
      for (let index = 0; index < expected.length; index++)
        maximum = Math.max(maximum, Math.abs(expected[index]! - actual[index]!));
      expect(maximum).toBeLessThanOrEqual(1e-6);
    }
    expect(context.gains[1]?.gain.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 0);
  }
);

it('does not schedule a source voiceover after abort', async () => {
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const controller = new AbortController();
  controller.abort();
  const context = new FakeOfflineAudioContext() as FakeOfflineAudioContext & OfflineAudioContext;
  await expect(
    scheduleOfflineAudioClipMix(
      context,
      {
        sourceKind: 'source-voiceover',
        id: 'take',
        assetId: 'voice',
        startTime: 0,
        duration: 1,
        sourceStart: 0,
        sourceDuration: 2,
        playbackRate: 2,
        volume: 1,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
        playbackEntry: {
          lane: 'voiceover',
          clipId: 'take',
          source: { kind: 'project', assetId: 'voice' },
          timelineStart: 0,
          duration: 1,
          sourceOffset: 0,
          volume: 1,
          fadeIn: 0,
          fadeOut: 0,
          playbackRate: 2,
        },
      },
      createAudioBuffer(1, 8000, 8000),
      controller.signal
    )
  ).rejects.toThrow();
  expect(context.lastSource).toBeNull();
});

it.each([
  { offset: 2, start: 2, media: 0, duration: 2 },
  { offset: -1, start: 0, media: 1, duration: 1 },
  { offset: 10, start: null, media: 0, duration: 0 },
])('schedules unmuted camera audio only inside media coverage ($offset)', async (expected) => {
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const context = new FakeOfflineAudioContext() as FakeOfflineAudioContext & OfflineAudioContext;
  const asset = createVideoProjectAsset(
    'Camera',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      width: 16,
      height: 9,
      duration: 2,
      mimeType: 'video/webm',
      size: 10,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset('camera-track', asset, 16, 9, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected camera');
  clip.duration = 4;
  clip.sourceDuration = 4;
  clip.cameraTiming = { offsetSeconds: expected.offset, transitions: 'bounded' };
  clip.muted = false;
  await scheduleOfflineAudioClipMix(context, clip, createAudioBuffer(1, 48000, 96000));
  if (expected.start === null) expect(context.lastSource).toBeNull();
  else {
    expect(context.lastSource!.start).toHaveBeenCalledWith(
      expected.start,
      expected.media,
      expected.duration
    );
    expect(context.lastSource!.stop).toHaveBeenCalledWith(expected.start + expected.duration);
  }
});

it('schedules bounded held-clip audio from the collector with the retained gain and fade phase', async () => {
  const { collectRenderableAudioClips } = await import('../clip-audio/collect');
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const project = createEmptyVideoProject('Held mix');
  const asset = createVideoProjectAsset(
    'Source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 0,
      height: 0,
      duration: 3,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createAudioClipFromAsset(project.tracks[0]!.id, asset, 2);
  Object.assign(clip, {
    sourceStart: 1,
    sourceDuration: 0.15,
    duration: 5 / 30 - 0.04,
    audioGainStart: 0.2,
    audioGainEnd: 0.8,
    fadeOutMs: 100,
    playbackWindow: {
      offset: 0.04,
      holdAt: 0.14,
      fadePhase: { offset: 0.04, duration: 0.15 },
      gainPhase: { offset: 0.04, duration: 0.15 },
    },
  });
  project.assets = [asset];
  project.clips = [clip];
  const prepared = collectRenderableAudioClips(project)[0]!;
  const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
    OfflineAudioContext;
  await scheduleOfflineAudioClipMix(context, prepared, createAudioBuffer(1, 48000, 144000));
  expect(context.lastSource?.start).toHaveBeenCalledWith(2, 1.04, expect.closeTo(0.11, 12));
  expect(context.lastSource?.stop).toHaveBeenCalledWith(expect.closeTo(2.11, 12));
  expect(context.gains[0]?.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.36, 12), 2);
  expect(context.gains[0]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
    expect.closeTo(0.8, 12),
    expect.closeTo(2.11, 12)
  );
  expect(context.gains[1]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
    0,
    expect.closeTo(2.11, 12)
  );
});

it('keeps a restored leading gain plateau through collection, range clipping and scheduling', async () => {
  const { collectRenderableAudioClips } = await import('../clip-audio/collect');
  const { scheduleOfflineAudioClipMix } = await import('./schedule');
  const project = createEmptyVideoProject('Restored gain');
  const asset = createVideoProjectAsset(
    'Source',
    'AUDIO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 0,
      height: 0,
      duration: 3,
      mimeType: 'audio/wav',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  const clip = createAudioClipFromAsset(project.tracks[0]!.id, asset);
  Object.assign(clip, {
    duration: 2.5,
    sourceDuration: 2.5,
    audioGainStart: 0.2,
    audioGainEnd: 0.8,
    playbackWindow: { offset: 0, gainPhase: { offset: -0.5, duration: 2 } },
  });
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 2.5;
  for (const partial of [false, true]) {
    const prepared = collectRenderableAudioClips(
      project,
      partial ? { rangeStartSeconds: 0.25, rangeEndSeconds: 2 } : undefined
    )[0]!;
    const context = new FakeOfflineAudioContext() as unknown as FakeOfflineAudioContext &
      OfflineAudioContext;
    await scheduleOfflineAudioClipMix(context, prepared, createAudioBuffer(1, 48000, 144000));
    expect(context.gains[0]?.gain.setValueAtTime).toHaveBeenCalledWith(0.2, 0);
    expect(context.gains[0]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.2,
      partial ? 0.25 : 0.5
    );
    expect(context.gains[0]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(partial ? 0.65 : 0.8, 12),
      partial ? 1.75 : 2.5
    );
  }
});
