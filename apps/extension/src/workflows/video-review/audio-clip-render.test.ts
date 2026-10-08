import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewAudioClipRenderer } from './audio-clip-render';
import { renderTempoBuffer } from '../../features/video/audio/tempo-buffer';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';

class Pcm {
  readonly planes: Float32Array[];
  constructor(readonly options: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.planes = Array.from(
      { length: options.numberOfChannels },
      () => new Float32Array(options.length)
    );
  }
  get length() {
    return this.options.length;
  }
  get sampleRate() {
    return this.options.sampleRate;
  }
  get numberOfChannels() {
    return this.options.numberOfChannels;
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number) {
    return this.planes[channel]!;
  }
}

beforeEach(() => vi.stubGlobal('AudioBuffer', Pcm));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function entry(rate: number, duration = 1.3): QuickEditAudioPlanEntry {
  return {
    lane: 'voiceover',
    clipId: 'voice',
    assetId: 'voice',
    timelineStart: 0,
    sourceOffset: 0.37,
    duration,
    playbackRate: rate,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
}

it.each([44100, 48000])(
  'matches preview PCM across native-rate windows and a mid-clip start at %sHz',
  async (sampleRate) => {
    const source = new AudioBuffer({ length: sampleRate * 4, sampleRate, numberOfChannels: 2 });
    for (let i = 0; i < source.length; i++) {
      const value = Math.sin(i * 0.021 + Math.sin(i * 0.0003)) * 0.4 + Math.sin(i * 0.037) * 0.1;
      source.getChannelData(0)[i] = value;
      source.getChannelData(1)[i] = -value * 0.5;
    }
    const clip = entry(1.5);
    const reference = await renderTempoBuffer(source, {
      start: clip.sourceOffset,
      duration: clip.duration * 1.5,
      rate: 1.5,
    });
    const renderer = createReviewAudioClipRenderer();
    const padding = Math.round(sampleRate * 0.02);
    const check = async (from: number, to: number) => {
      const window = await renderer.render(clip, source, from, to, new AbortController().signal);
      const start = Math.round(from * sampleRate) - padding;
      for (let c = 0; c < 2; c++) {
        const expected = new Float32Array(window.length);
        for (let i = 0; i < window.length; i++)
          expected[i] = reference.getChannelData(c)[start + i] ?? 0;
        expect(window.getChannelData(c)).toEqual(expected);
      }
      return window;
    };
    const first = await check(0.43, 0.93);
    const second = await check(0.93, 1.3);
    expect(first.getChannelData(0).slice(-2 * padding)).toEqual(
      second.getChannelData(0).slice(0, 2 * padding)
    );
    await check(0, 0.2);
    expect(source.length).toBe(sampleRate * 4);
  }
);

it.each([0.0625, 0.5, 2, 16])(
  'preserves vocal pitch and exact duration at %sx with bounded output',
  async (rate) => {
    const sampleRate = 48000;
    const duration = 3;
    const clip = entry(rate, duration);
    const source = new AudioBuffer({
      length: Math.ceil((clip.sourceOffset + duration * rate) * sampleRate),
      sampleRate,
      numberOfChannels: 1,
    });
    for (let i = 0; i < source.length; i++)
      source.getChannelData(0)[i] = Math.sin((2 * Math.PI * 180 * i) / sampleRate) * 0.5;
    const output = await createReviewAudioClipRenderer().render(
      clip,
      source,
      1,
      2,
      new AbortController().signal
    );
    expect(output.length).toBe(Math.round(1.04 * sampleRate));
    let crossings = 0;
    const plane = output.getChannelData(0);
    for (let i = 4801; i < plane.length - 4800; i++)
      if (plane[i - 1]! < 0 && plane[i]! >= 0) crossings++;
    expect((crossings * sampleRate) / (plane.length - 9600)).toBeCloseTo(180, -1);
  }
);

it('cancels while priming a late fragment and never returns a partial buffer', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const source = new AudioBuffer({ length: 48000 * 12, sampleRate: 48000, numberOfChannels: 1 });
  const pending = createReviewAudioClipRenderer().render(
    entry(2, 5),
    source,
    4,
    5,
    controller.signal
  );
  const rejection = expect(pending).rejects.toThrow('cancelled');
  controller.abort(new Error('cancelled'));
  await vi.runAllTimersAsync();
  await rejection;
});

it.each(
  [
    { rate: 0.5, sampleRate: 8000 },
    { rate: 1, sampleRate: 8000 },
    { rate: 1.5, sampleRate: 8000 },
    { rate: 16, sampleRate: 8000 },
    { rate: 1.5, sampleRate: 44100 },
  ].flatMap((configuration) =>
    [0.37, 70.25].map((sourceOffset) => ({ ...configuration, sourceOffset }))
  )
)(
  'keeps exact buffer parity for streamed distant clip windows at $rate x / $sampleRate Hz / offset $sourceOffset',
  async ({ rate, sampleRate, sourceOffset }) => {
    const source = new AudioBuffer({ length: sampleRate * 170, sampleRate, numberOfChannels: 2 });
    const sourceOffsets = [sourceOffset];
    for (let c = 0; c < 2; c++) {
      const plane = source.getChannelData(c);
      for (const offset of sourceOffsets)
        for (
          let i = Math.floor(offset * sampleRate);
          i < Math.ceil((offset + 5 * rate) * sampleRate);
          i++
        )
          plane[i] = Math.sin(i * 0.037 + c) * 0.3;
    }
    const reads: { start: number; end: number }[] = [];
    const streamed: import('./audio-clip-source').ReviewAudioClipSource = {
      sampleRate,
      numberOfChannels: 2,
      length: source.length,
      dispose() {},
      async read(start, end, signal) {
        signal.throwIfAborted();
        reads.push({ start, end });
        return {
          start,
          planes: [0, 1].map((c) => {
            const plane = new Float32Array(end - start);
            const from = Math.max(0, start);
            const to = Math.min(source.length, end);
            if (to > from) plane.set(source.getChannelData(c).subarray(from, to), from - start);
            return plane;
          }),
        };
      },
    };
    const buffered = createReviewAudioClipRenderer();
    const bounded = createReviewAudioClipRenderer();
    const clip = { ...entry(rate, 5), sourceOffset };
    for (const [from, to] of [
      [3.1, 3.7],
      [3.7, 4.5],
    ] as const) {
      const expected = await buffered.render(clip, source, from, to, new AbortController().signal);
      const actual = await bounded.render(clip, streamed, from, to, new AbortController().signal);
      for (let c = 0; c < 2; c++) {
        const actualPcm = actual.getChannelData(c);
        const expectedPcm = expected.getChannelData(c);
        expect(actualPcm.length).toBe(expectedPcm.length);
        const actualBits = new Uint32Array(
          actualPcm.buffer,
          actualPcm.byteOffset,
          actualPcm.length
        );
        const expectedBits = new Uint32Array(
          expectedPcm.buffer,
          expectedPcm.byteOffset,
          expectedPcm.length
        );
        expect(actualBits.every((bits, index) => bits === expectedBits[index])).toBe(true);
      }
    }
    expect(reads.length).toBeGreaterThan(2);
    expect(Math.max(...reads.map((window) => window.end - window.start))).toBeLessThanOrEqual(
      sampleRate * 4.1
    );
  }
);
