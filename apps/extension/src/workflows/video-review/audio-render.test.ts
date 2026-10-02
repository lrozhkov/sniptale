import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { expect, it, vi } from 'vitest';
import { chooseReviewAudioCodec, renderReviewAudio } from './audio-render';

it('keeps unsupported audio processing separate from packet-copy support and honors cancellation', async () => {
  const input = new Input({
    source: new BlobSource(
      new Blob([await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm')])
    ),
    formats: ALL_FORMATS,
  });
  vi.stubGlobal('OfflineAudioContext', undefined);
  try {
    const track = (await input.getPrimaryAudioTrack())!;
    expect(await chooseReviewAudioCodec(track, 'webm')).toBeNull();
    const controller = new AbortController();
    controller.abort(new Error('cancelled before rendering'));
    const samples = renderReviewAudio(
      track,
      { sourceStart: 0, sourceEnd: 4, resultStart: 0, resultEnd: 1, rate: 4, kind: 'speed' },
      false,
      controller.signal
    );
    await expect(samples.next()).rejects.toThrow('cancelled before rendering');
  } finally {
    input.dispose();
    vi.unstubAllGlobals();
  }
});

const audioMock = vi.hoisted(() => ({
  packets: [] as { timestamp: number; duration: number; data: Uint8Array }[],
  samples: vi.fn(),
  encode: vi.fn(),
}));
vi.mock('mediabunny', async (importOriginal) => ({
  ...(await importOriginal<typeof import('mediabunny')>()),
  canEncodeAudio: audioMock.encode,
  EncodedPacketSink: class {
    async getPacket(time: number) {
      return [...audioMock.packets].reverse().find((packet) => packet.timestamp <= time) ?? null;
    }
    async getFirstPacket() {
      return audioMock.packets[0] ?? null;
    }
    async getNextPacket(packet: object) {
      return (
        audioMock.packets[audioMock.packets.findIndex((value) => value === packet) + 1] ?? null
      );
    }
  },
  AudioSampleSink: class {
    async *samples(start: number, end: number) {
      for (const sample of audioMock.samples(start, end)) yield sample;
    }
  },
}));

import { AudioSample, EncodedPacket } from 'mediabunny';
import { audioPacketDuration } from './audio-render';
import { createReviewAudioClipRenderer } from './audio-clip-render';
import { renderTempoBuffer } from '../../features/video/audio/tempo-buffer';

class TestAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly planes: Float32Array[];
  constructor(options: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.planes = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(this.length)
    );
  }
  getChannelData(channel: number) {
    return this.planes[channel]!;
  }
  copyToChannel(data: Float32Array, channel: number) {
    this.planes[channel]!.set(data);
  }
  copyFromChannel(data: Float32Array, channel: number, start = 0) {
    data.set(this.planes[channel]!.subarray(start, start + data.length));
  }
}

function installAudioContext() {
  const windows: {
    input?: TestAudioBuffer;
    frames: number;
    sources?: { buffer: AudioBuffer | null; rate: number; started?: number[] }[];
    rate?: number;
    gains?: Array<{
      gain: { value: number; readonlyPoints: Array<[string, number, number]> };
      destinations: unknown[];
    }>;
  }[] = [];
  let onRender = () => {};
  vi.stubGlobal('AudioBuffer', TestAudioBuffer);
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      readonly destination = {};
      readonly window: (typeof windows)[number];
      constructor(
        readonly channels: number,
        readonly frames: number,
        readonly rate: number
      ) {
        this.window = { frames };
        windows.push(this.window);
      }
      createBuffer(channels: number, length: number, sampleRate: number) {
        this.window.input = new TestAudioBuffer({ numberOfChannels: channels, length, sampleRate });
        return this.window.input;
      }
      createBufferSource() {
        const window = this.window;
        const source = {
          buffer: null as AudioBuffer | null,
          rate: 1,
          started: [] as number[],
          playbackRate: {
            set value(rate: number) {
              window.rate = rate;
              source.rate = rate;
            },
          },
          connect() {},
          start(...args: number[]) {
            source.started = args;
          },
        };
        window.sources ??= [];
        window.sources.push(source);
        return source;
      }
      createGain() {
        const window = this.window;
        const gain = {
          value: 1,
          readonlyPoints: [] as Array<[string, number, number]>,
          setValueAtTime(value: number, time: number) {
            gain.readonlyPoints.push(['set', value, time]);
          },
          linearRampToValueAtTime(value: number, time: number) {
            gain.readonlyPoints.push(['ramp', value, time]);
          },
        };
        window.gains ??= [];
        window.gains!.push({ gain, destinations: [] });
        return {
          gain,
          connect(destination: unknown) {
            window.gains!.at(-1)!.destinations.push(destination);
            return destination;
          },
        };
      }
      async startRendering() {
        onRender();
        const result = new TestAudioBuffer({
          numberOfChannels: this.channels,
          length: this.frames,
          sampleRate: this.rate,
        });
        result.getChannelData(0).fill(0.5, 960);
        return result;
      }
    }
  );
  return {
    windows,
    onRender(action: () => void) {
      onRender = action;
    },
  };
}

async function audioFixture() {
  audioMock.packets = [];
  audioMock.samples.mockReset();
  audioMock.encode.mockReset();
  const context = installAudioContext();
  const input = new Input({
    source: new BlobSource(
      new Blob([await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm')])
    ),
    formats: ALL_FORMATS,
  });
  const track = (await input.getPrimaryAudioTrack())!;
  vi.spyOn(track, 'canDecode').mockResolvedValue(true);
  return {
    ...context,
    track,
    cleanup() {
      input.dispose();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

function decodedSample(timestamp: number, duration: number, channels = 1) {
  return new AudioSample({
    format: 'f32-planar',
    sampleRate: 48_000,
    numberOfChannels: channels,
    timestamp,
    numberOfFrames: Math.round(duration * 48_000),
    data: new Float32Array(Math.round(duration * 48_000) * channels).fill(0.25),
  });
}

it('decodes discontinuous packet runs separately and leaves the missing source interval silent', async () => {
  const fixture = await audioFixture();
  const closed: ReturnType<typeof vi.spyOn>[] = [];
  audioMock.packets = [0.2, 0.22, 0.24, 0.8, 0.82].map((timestamp) => ({
    timestamp,
    duration: 0.02,
    data: new Uint8Array([0xf8, 0]),
  }));
  audioMock.samples.mockImplementation((start: number, end: number) => {
    const sample = decodedSample(start - 0.01, end - start + 0.02);
    closed.push(vi.spyOn(sample, 'close'));
    return [sample];
  });
  try {
    const output = [];
    for await (const sample of renderReviewAudio(
      fixture.track,
      { sourceStart: 0, sourceEnd: 1, resultStart: 0, resultEnd: 1, rate: 1, kind: 'keep' },
      false,
      new AbortController().signal
    )) {
      const data = new Float32Array(sample.numberOfFrames);
      sample.copyTo(data, { planeIndex: 0, format: 'f32-planar' });
      output.push({ timestamp: sample.timestamp, frames: sample.numberOfFrames, first: data[0] });
    }
    expect(audioMock.samples.mock.calls).toEqual([
      [0.2, 0.26],
      [0.8, 0.84],
    ]);
    const pcm = fixture.windows[0]!.input!.getChannelData(0);
    const at = (time: number) => pcm[Math.round((time + 0.02) * 48_000)];
    expect(at(0.1)).toBe(0);
    expect(at(0.21)).toBe(0.25);
    expect(at(0.5)).toBe(0);
    expect(at(0.81)).toBe(0.25);
    expect(output).toEqual([{ timestamp: 0, frames: 48_000, first: 0.5 }]);
    expect(closed.every((close) => close.mock.calls.length === 1)).toBe(true);
  } finally {
    fixture.cleanup();
  }
});

it('bounds accelerated windows and emits a short final chunk without a whole-source buffer', async () => {
  const fixture = await audioFixture();
  try {
    const times = [];
    for await (const sample of renderReviewAudio(
      fixture.track,
      { sourceStart: 0, sourceEnd: 9, resultStart: 0, resultEnd: 2.25, rate: 4, kind: 'speed' },
      false,
      new AbortController().signal
    ))
      times.push([sample.timestamp, sample.numberOfFrames]);
    expect(times).toEqual([
      [0, 48_000],
      [1, 48_000],
      [2, 12_000],
    ]);
    expect(fixture.windows.map((window) => window.rate)).toEqual([1, 1, 1]);
    expect(Math.max(...fixture.windows.map((window) => window.input!.length))).toBeLessThanOrEqual(
      199_681
    );
    expect(audioMock.samples).not.toHaveBeenCalled();
  } finally {
    fixture.cleanup();
  }
});

it('exports zero-fade external clips at constant gain through their end', async () => {
  const fixture = await audioFixture();
  try {
    const clipBuffer = new TestAudioBuffer({
      numberOfChannels: 1,
      length: 96_000,
      sampleRate: 48_000,
    });
    const entry = {
      lane: 'music' as const,
      clipId: 'm',
      assetId: 'project-asset:m',
      timelineStart: 0.5,
      duration: 0.5,
      sourceOffset: 0,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    };
    const samples = [];
    for await (const sample of renderReviewAudio(
      fixture.track,
      { sourceStart: 0, sourceEnd: 1, resultStart: 0, resultEnd: 1, rate: 1, kind: 'keep' },
      false,
      new AbortController().signal,
      {
        entries: [entry],
        buffers: new Map<string, AudioBuffer>([
          ['project-asset:m', clipBuffer as unknown as AudioBuffer],
        ]),
        originalVolume: 2,
        originalMuted: false,
      }
    ))
      samples.push(sample);
    const window = fixture.windows[0]!;
    // The original chain gains by 2; the clip is placed at its output position
    // with a full clip-local envelope, starting mid-clip at the matching gain.
    expect(window.gains!).toHaveLength(2);
    expect(window.gains![0]!.gain.value).toBe(2);
    const clipGain = window.gains![1]!.gain;
    expect(clipGain.readonlyPoints[0]).toEqual(['set', 1, 0.02 + 0.5]);
    expect(clipGain.readonlyPoints.at(-1)).toEqual(['ramp', 1, 0.02 + 1]);
    expect(clipGain.readonlyPoints.every((point) => point[1] === 1)).toBe(true);
  } finally {
    fixture.cleanup();
  }
});

it('exports a voiceover slice with the same asset rate and fade phase as preview', async () => {
  const fixture = await audioFixture();
  try {
    const buffer = new TestAudioBuffer({
      numberOfChannels: 1,
      length: 192_000,
      sampleRate: 48_000,
    });
    for await (const _sample of renderReviewAudio(
      fixture.track,
      { sourceStart: 0, sourceEnd: 1, resultStart: 0, resultEnd: 1, rate: 1, kind: 'keep' },
      false,
      new AbortController().signal,
      {
        entries: [
          {
            lane: 'voiceover',
            clipId: 'v:slice',
            assetId: 'voice',
            timelineStart: 0,
            duration: 1,
            sourceOffset: 1,
            volume: 1,
            fadeIn: 1,
            fadeOut: 1,
            playbackRate: 2,
            fadePhase: { offset: 1, duration: 4 },
          },
        ],
        buffers: new Map([['voice', buffer as unknown as AudioBuffer]]),
        originalVolume: 1,
        originalMuted: false,
      }
    )) {
      /* consume the generated output window */
    }
    const window = fixture.windows[0]!;
    expect(window.sources?.[1]).toMatchObject({ rate: 1, started: [0, 0, 1.04] });
    expect(window.sources?.[1]?.buffer?.length).toBe(49920);
    expect(window.gains?.[0]?.gain.readonlyPoints[0]).toEqual(['set', 1, 0]);
    expect(window.gains?.[0]?.gain.readonlyPoints.every((point) => point[1] === 1)).toBe(true);
  } finally {
    fixture.cleanup();
  }
});

it('keeps external speech PCM continuous across separate video-segment renders', async () => {
  const fixture = await audioFixture();
  try {
    const buffer = new AudioBuffer({ length: 48000 * 4, sampleRate: 48000, numberOfChannels: 1 });
    for (let i = 0; i < buffer.length; i++)
      buffer.getChannelData(0)[i] = Math.sin(i * 0.021 + Math.sin(i * 0.0002)) * 0.5;
    const entry = {
      lane: 'voiceover' as const,
      clipId: 'voice',
      assetId: 'voice',
      timelineStart: 0,
      sourceOffset: 0.37,
      duration: 1.75,
      playbackRate: 1.5,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    };
    const plan = {
      entries: [entry],
      buffers: new Map([['voice', buffer]]),
      originalVolume: 1,
      originalMuted: true,
    };
    const renderer = createReviewAudioClipRenderer();
    const reference = await renderTempoBuffer(buffer, {
      start: 0.37,
      duration: 1.75 * 1.5,
      rate: 1.5,
    });
    for (const segment of [
      {
        sourceStart: 0,
        sourceEnd: 0.875,
        resultStart: 0,
        resultEnd: 0.875,
        rate: 1,
        kind: 'keep' as const,
      },
      {
        sourceStart: 0.875,
        sourceEnd: 2.625,
        resultStart: 0.875,
        resultEnd: 1.75,
        rate: 2,
        kind: 'speed' as const,
      },
    ])
      for await (const _sample of renderReviewAudio(
        null,
        segment,
        true,
        new AbortController().signal,
        plan,
        renderer
      )) {
        /* consume each separate segment invocation */
      }
    expect(fixture.windows).toHaveLength(2);
    for (let index = 0; index < 2; index++) {
      const source = fixture.windows[index]!.sources![0]!;
      expect(source.rate).toBe(1);
      const start = index * 42000 - 960;
      const expected = new Float32Array(43920);
      for (let i = 0; i < expected.length; i++)
        expected[i] = reference.getChannelData(0)[start + i] ?? 0;
      expect(source.buffer?.getChannelData(0)).toEqual(expected);
    }
  } finally {
    fixture.cleanup();
  }
});

it.each([0.0625, 0.125, 8, 16])('bounds source and output buffers at rate %s', async (rate) => {
  const fixture = await audioFixture();
  try {
    let frames = 0;
    for await (const sample of renderReviewAudio(
      fixture.track,
      { sourceStart: 0, sourceEnd: 2, resultStart: 0, resultEnd: 2 / rate, rate, kind: 'speed' },
      false,
      new AbortController().signal
    )) {
      expect(sample.numberOfFrames).toBeLessThanOrEqual(48_000);
      frames += sample.numberOfFrames;
    }
    expect(frames).toBe(Math.round(96_000 / rate));
    expect(Math.max(...fixture.windows.map((window) => window.input!.length))).toBeLessThanOrEqual(
      222_722
    );
  } finally {
    fixture.cleanup();
  }
});

it('does not decode muted ranges and rejects a render completed after cancellation', async () => {
  const fixture = await audioFixture();
  const controller = new AbortController();
  fixture.onRender(() => controller.abort(new Error('cancelled during bounded render')));
  try {
    const samples = renderReviewAudio(
      fixture.track,
      { sourceStart: 0, sourceEnd: 2, resultStart: 0, resultEnd: 1, rate: 2, kind: 'speed' },
      true,
      controller.signal
    );
    await expect(samples.next()).rejects.toThrow('cancelled during bounded render');
    expect(fixture.windows[0]!.input).toBeUndefined();
    expect(audioMock.samples).not.toHaveBeenCalled();
  } finally {
    fixture.cleanup();
  }
});

it('rejects a mid-track channel change and closes the rejected decoded sample', async () => {
  const fixture = await audioFixture();
  audioMock.packets = [{ timestamp: 0, duration: 0.02, data: new Uint8Array([0xf8, 0]) }];
  const sample = decodedSample(0, 0.02, 2);
  const close = vi.spyOn(sample, 'close');
  audioMock.samples.mockReturnValue([sample]);
  try {
    const samples = renderReviewAudio(
      fixture.track,
      { sourceStart: 0, sourceEnd: 1, resultStart: 0, resultEnd: 1, rate: 1, kind: 'keep' },
      false,
      new AbortController().signal
    );
    await expect(samples.next()).rejects.toThrow('Audio parameters changed');
    expect(close).toHaveBeenCalledOnce();
  } finally {
    fixture.cleanup();
  }
});

it('chooses supported AAC or Opus and rejects unsupported channel counts before encoding', async () => {
  const fixture = await audioFixture();
  try {
    audioMock.encode.mockResolvedValue(true);
    expect(await chooseReviewAudioCodec(fixture.track, 'mp4')).toBe('aac');
    audioMock.encode.mockImplementation(async (codec: string) => codec === 'opus');
    expect(await chooseReviewAudioCodec(fixture.track, 'mp4')).toBe('opus');
    expect(await chooseReviewAudioCodec(fixture.track, 'webm')).toBe('opus');
    audioMock.encode.mockResolvedValue(false);
    expect(await chooseReviewAudioCodec(fixture.track, 'webm')).toBeNull();
    vi.spyOn(fixture.track, 'getNumberOfChannels').mockResolvedValue(9);
    audioMock.encode.mockClear();
    expect(await chooseReviewAudioCodec(fixture.track, 'mp4')).toBeNull();
    expect(audioMock.encode).not.toHaveBeenCalled();
  } finally {
    fixture.cleanup();
  }
});

it('reads variable Opus packet durations and rejects empty or invalid frame counts', () => {
  const packet = (data: number[]) => new EncodedPacket(new Uint8Array(data), 'key', 0, 0);
  expect(audioPacketDuration(packet([0xf8]), 'opus', 48_000)).toBe(0.02);
  expect(audioPacketDuration(packet([3, 6]), 'opus', 48_000)).toBe(0.06);
  expect(audioPacketDuration(packet([97]), 'opus', 48_000)).toBe(0.02);
  expect(audioPacketDuration(packet([130]), 'opus', 48_000)).toBe(0.005);
  expect(audioPacketDuration(packet([]), 'aac', 48_000)).toBe(1024 / 48_000);
  expect(() => audioPacketDuration(packet([]), 'opus', 48_000)).toThrow('Empty Opus');
  expect(() => audioPacketDuration(packet([3, 0]), 'opus', 48_000)).toThrow('Invalid Opus');
});

it.each([48000, 44100])(
  'feeds pitch-preserved PCM with continuous resampler context at %s Hz',
  async (sampleRate) => {
    const fixture = await audioFixture();
    vi.spyOn(fixture.track, 'getSampleRate').mockResolvedValue(sampleRate);
    audioMock.packets = Array.from({ length: 160 }, (_, i) => ({
      timestamp: i * 0.02,
      duration: 0.02,
      data: new Uint8Array([0xf8, 0]),
    }));
    audioMock.samples.mockImplementation((start: number, end: number) => {
      const count = Math.round((end - start) * sampleRate);
      const data = Float32Array.from(
        { length: count },
        (_, i) => 0.5 * Math.sin(2 * Math.PI * 200 * (start + i / sampleRate))
      );
      return [
        new AudioSample({
          format: 'f32-planar',
          sampleRate,
          numberOfChannels: 1,
          timestamp: start,
          numberOfFrames: count,
          data,
        }),
      ];
    });
    try {
      for await (const _sample of renderReviewAudio(
        fixture.track,
        {
          sourceStart: 0.2,
          sourceEnd: 3.2,
          resultStart: 0,
          resultEnd: 1.5,
          rate: 2,
          kind: 'speed',
        },
        false,
        new AbortController().signal
      )) {
        /* consume */
      }
      const padded = fixture.windows.map((window) => window.sources![0]!.buffer!.getChannelData(0));
      const padding = Math.round(sampleRate * 0.02);
      expect(padded[0]!.slice(-2 * padding)).toEqual(padded[1]!.slice(0, 2 * padding));
      const chunks = padded.map((chunk) => chunk.subarray(padding, chunk.length - padding));
      expect(chunks.map((chunk) => chunk.length)).toEqual([sampleRate, sampleRate / 2]);
      for (const chunk of chunks) {
        let crosses = 0;
        for (let i = 4801; i < chunk.length - 4800; i++)
          if (chunk[i - 1]! < 0 && chunk[i]! >= 0) crosses++;
        expect((crosses * sampleRate) / (chunk.length - 9600)).toBeCloseTo(200, -1);
      }
      expect(Math.abs(chunks[1]![0]! - chunks[0]!.at(-1)!)).toBeLessThan(0.03);
    } finally {
      fixture.cleanup();
    }
  }
);

it('applies source gain inside a fragment without scaling the added music buffer', async () => {
  const fixture = await audioFixture();
  audioMock.packets = Array.from({ length: 50 }, (_, i) => ({
    timestamp: 2 + i * 0.02,
    duration: 0.02,
    data: new Uint8Array([0xf8, 0]),
  }));
  audioMock.samples.mockImplementation((start: number, end: number) => [
    decodedSample(start, end - start),
  ]);
  const music = new AudioBuffer({ length: 48_000, numberOfChannels: 1, sampleRate: 48_000 });
  music.getChannelData(0).fill(0.75);
  try {
    for await (const _sample of renderReviewAudio(
      fixture.track,
      { sourceStart: 2, sourceEnd: 3, resultStart: 0, resultEnd: 1, rate: 1, kind: 'keep' },
      false,
      new AbortController().signal,
      {
        entries: [],
        buffers: new Map([['music', music]]),
        originalVolume: 1,
        originalMuted: false,
        originalRanges: [
          { id: 'mute', start: 2.2, end: 2.4, volume: 0 },
          { id: 'boost', start: 2.4, end: 2.6, volume: 2 },
        ],
      }
    )) {
      /* drain */
    }
    const pcm = fixture.windows[0]!.sources![0]!.buffer!.getChannelData(0);
    const at = (time: number) => pcm[Math.round((time + 0.02) * 48_000)];
    expect(at(0.1)).toBeCloseTo(0.25);
    expect(at(0.3)).toBe(0);
    expect(at(0.5)).toBeCloseTo(0.5);
    expect(at(0.7)).toBeCloseTo(0.25);
    expect(music.getChannelData(0)[0]).toBe(0.75);
  } finally {
    fixture.cleanup();
  }
});
