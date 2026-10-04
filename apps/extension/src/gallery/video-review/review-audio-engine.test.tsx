// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFile } from 'node:fs/promises';
import { createDefaultEngine, useReviewAudioRuntime } from './use-review-audio-runtime';
import type { QuickEditClipSchedule } from '../../features/video/review/advanced/audio-plan';

class FakeParam {
  value = 0;
  readonly points: Array<[string, number, number]> = [];
  setValueAtTime(value: number, time: number) {
    this.points.push(['set', value, time]);
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.points.push(['ramp', value, time]);
  }
}

class FakeNode {
  readonly gain = new FakeParam();
  readonly playbackRate = new FakeParam();
  buffer: unknown = null;
  onended: (() => void) | null = null;
  readonly destinations: unknown[] = [];
  started: number[] | null = null;
  stopped = false;
  connect(destination: unknown) {
    this.destinations.push(destination);
    return this;
  }
  disconnect() {
    this.destinations.length = 0;
  }
  start(when: number, offset: number, duration: number) {
    this.started = [when, offset, duration];
  }
  stop() {
    this.stopped = true;
  }
}

class FakeContext {
  readonly destination = new FakeNode();
  currentTime = 50;
  captured: unknown = null;
  readonly sources: FakeNode[] = [];
  readonly gains: FakeNode[] = [];
  resumed = false;
  close = vi.fn(async () => undefined);
  createGain() {
    const node = new FakeNode();
    this.gains.push(node);
    return node;
  }
  createBufferSource() {
    const node = new FakeNode();
    this.sources.push(node);
    return node;
  }
  createMediaElementSource(element: unknown) {
    this.captured = element;
    return new FakeNode();
  }
  resume() {
    this.resumed = true;
    return Promise.resolve();
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 9 });
  }
}

function captureFakeContext(assign: (made: FakeContext) => void): typeof AudioContext {
  const Constructing = function () {
    const made = new FakeContext();
    assign(made);
    return made;
  };
  return Constructing as unknown as typeof AudioContext;
}

afterEach(() => vi.unstubAllGlobals());

it('builds the default Web Audio engine graph', async () => {
  let context!: FakeContext;
  vi.stubGlobal(
    'AudioContext',
    captureFakeContext((made) => (context = made))
  );
  const element = document.createElement('video');
  const engine = createDefaultEngine(element);
  expect(context.captured).toBe(element);
  engine!.setOriginalGain(2);
  expect(context.gains[0]!.gain.value).toBe(2);
  engine!.setOriginalGain(0.5);
  expect(context.gains[0]!.gain.value).toBe(1);
  engine!.setOriginalGain(0);
  expect(context.gains[0]!.gain.value).toBe(0);
  engine!.setOriginalGain(0.5);
  expect(context.gains[0]!.gain.value).toBe(1);
  const schedule = {
    when: 60,
    offset: 1,
    duration: 3,
    playbackRate: 1,
    envelope: [
      [60, 1],
      [63, 0],
    ] as QuickEditClipSchedule['envelope'],
  };
  const handle = engine!.scheduleClip(schedule, await engine!.decode(new ArrayBuffer(0)));
  expect(context.sources).toHaveLength(1);
  expect(context.sources[0]!.started).toEqual([60, 1, 3]);
  expect(context.sources[0]!.playbackRate.value).toBe(1);
  expect(context.sources[0]!.destinations[0]).toBe(context.gains[1]);
  const gain = context.gains[1]!;
  expect(gain.gain.points).toEqual([
    ['set', 1, 60],
    ['ramp', 0, 63],
  ]);
  handle.stop();
  expect(context.sources[0]!.stopped).toBe(true);
  expect(context.sources[0]!.destinations).toHaveLength(0);
  context.sources[0]!.onended?.();
  engine!.dispose();
  engine!.dispose();
  expect(context.close).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it('creates a default engine without a captured element', async () => {
  let context!: FakeContext;
  vi.stubGlobal(
    'AudioContext',
    captureFakeContext((made) => (context = made))
  );
  const engine = createDefaultEngine(null);
  expect(context.captured).toBeNull();
  engine!.setOriginalGain(2);
  expect(context.gains).toHaveLength(0);
  const handle = engine!.scheduleClip(
    {
      when: 60,
      offset: 0,
      duration: 2,
      envelope: [[60, 1]] as QuickEditClipSchedule['envelope'],
    },
    await engine!.decode(new ArrayBuffer(0))
  );
  handle.stop();
  vi.unstubAllGlobals();
});

it('ignores stop failures from finished clip sources', async () => {
  let context!: FakeContext;
  vi.stubGlobal(
    'AudioContext',
    captureFakeContext((made) => (context = made))
  );
  const engine = createDefaultEngine(null);
  const handle = engine!.scheduleClip(
    {
      when: 60,
      offset: 0,
      duration: 2,
      envelope: [[60, 1]] as QuickEditClipSchedule['envelope'],
    },
    await engine!.decode(new ArrayBuffer(0))
  );
  context.sources[0]!.stop = () => {
    throw new Error('already ended');
  };
  expect(() => handle.stop()).not.toThrow();
  vi.unstubAllGlobals();
});

class SpeechPcm {
  readonly planes: Float32Array[];
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  constructor(options: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.numberOfChannels = options.numberOfChannels;
    this.planes = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(this.length)
    );
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number) {
    return this.planes[channel]!;
  }
}

async function spokenVoice() {
  const wav = await readFile('tooling/test/e2e/fixtures/review-voice-speech.wav');
  let at = 12;
  while (wav.toString('ascii', at, at + 4) !== 'data') {
    const size = wav.readUInt32LE(at + 4);
    at += 8 + size + (size % 2);
  }
  const length = wav.readUInt32LE(at + 4) / 2;
  const voice = new AudioBuffer({ length, sampleRate: 48000, numberOfChannels: 1 });
  for (let i = 0; i < length; i++)
    voice.getChannelData(0)[i] = wav.readInt16LE(at + 8 + i * 2) / 32768;
  return voice;
}

it('processes accelerated spoken voice before connecting a native-rate preview node', async () => {
  vi.stubGlobal('AudioBuffer', SpeechPcm);
  const voice = await spokenVoice();
  let context!: FakeContext;
  vi.stubGlobal(
    'AudioContext',
    captureFakeContext((made) => {
      context = made;
      made.decodeAudioData = async () => voice;
    })
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const video = { current: document.createElement('video') };
  function Harness() {
    useReviewAudioRuntime({
      video,
      playing: true,
      outputTime: 0,
      original: { volume: 1, muted: true },
      voiceover: [
        {
          id: 'speech',
          assetId: 'speech',
          timelineStart: 0,
          sourceOffset: 0,
          duration: voice.duration / 2,
          playbackRate: 2,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
      music: [],
      resolveAsset: async () => new Blob(),
      sessionKey: 'spoken-voice',
      onFailure: () => {
        throw new Error('spoken voice playback failed');
      },
    });
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    const source = context.sources[0]!;
    expect(source.playbackRate.value).toBe(1);
    expect(source.buffer).not.toBe(voice);
    const prepared = source.buffer as AudioBuffer;
    expect(prepared.length).toBe(Math.round(voice.length / 2));
    expect(prepared.getChannelData(0).some((value) => Math.abs(value) > 0.01)).toBe(true);
    expect(source.started?.[2]).toBeCloseTo(voice.duration / 2, 4);
  } finally {
    act(() => root.unmount());
  }
});

it.each([0.5, 1.25, 2, 4, 16])(
  'keeps actual vocal PCM pitch at %sx in the browser graph',
  async (rate) => {
    vi.stubGlobal('AudioBuffer', SpeechPcm);
    const voice = new AudioBuffer({ length: 48000 * 3, sampleRate: 48000, numberOfChannels: 1 });
    for (let i = 0; i < voice.length; i++)
      voice.getChannelData(0)[i] = Math.sin((2 * Math.PI * 180 * i) / 48000) * 0.5;
    let context!: FakeContext;
    vi.stubGlobal(
      'AudioContext',
      captureFakeContext((made) => {
        context = made;
        made.decodeAudioData = async () => voice;
      })
    );
    const engine = createDefaultEngine(null)!;
    try {
      const entry = {
        lane: 'voiceover' as const,
        clipId: 'voice',
        assetId: 'voice',
        timelineStart: 0,
        sourceOffset: 0.2,
        duration: 2 / rate,
        playbackRate: rate,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      };
      const buffer = await engine.prepareClip(
        await engine.decode(new ArrayBuffer(0)),
        entry,
        new AbortController().signal
      );
      engine.scheduleClip(
        { when: 50, offset: 0, duration: entry.duration, envelope: [[50, 1]] },
        buffer
      );
      const node = context.sources[0]!;
      const processed = node.buffer as AudioBuffer;
      expect(node.playbackRate.value).toBe(1);
      expect(processed.length).toBe(Math.round(entry.duration * 48000));
      const samples = processed.getChannelData(0);
      const from = Math.round(samples.length * 0.2);
      const to = Math.round(samples.length * 0.8);
      let crosses = 0;
      let first = 0;
      let last = 0;
      for (let i = from + 1; i < to; i++)
        if (samples[i - 1]! < 0 && samples[i]! >= 0) {
          const crossing = i - 1 - samples[i - 1]! / (samples[i]! - samples[i - 1]!);
          if (crosses === 0) first = crossing;
          last = crossing;
          crosses++;
        }
      expect(((crosses - 1) * 48000) / (last - first)).toBeCloseTo(180, -1);
      expect(voice.length).toBe(144000);
    } finally {
      engine.dispose();
    }
  }
);
