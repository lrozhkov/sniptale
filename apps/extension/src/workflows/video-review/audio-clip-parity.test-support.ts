import { expect } from 'vitest';
import { createReviewAudioClipRenderer } from './audio-clip-render';
import type { ReviewAudioClipSource } from './audio-clip-source';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';

export class Pcm {
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

export function createParitySource(options: {
  sampleRate: number;
  sourceOffset: number;
  duration: number;
  rate: number;
  sourceSeconds?: number;
}) {
  const { sampleRate, sourceOffset, duration, rate } = options;
  const source = new AudioBuffer({
    length: Math.ceil((options.sourceSeconds ?? sourceOffset + duration * rate + 1) * sampleRate),
    sampleRate,
    numberOfChannels: 2,
  });
  for (let channel = 0; channel < 2; channel++) {
    const plane = source.getChannelData(channel);
    for (
      let frame = Math.floor(sourceOffset * sampleRate);
      frame < Math.ceil((sourceOffset + duration * rate) * sampleRate);
      frame++
    )
      plane[frame] = Math.sin(frame * 0.037 + channel) * 0.3;
  }
  return source;
}

export async function expectAudioClipWindows(args: {
  clip: QuickEditAudioPlanEntry;
  source: AudioBuffer;
  windows: readonly (readonly [number, number])[];
  preview?: AudioBuffer;
}) {
  const { clip, source, windows, preview } = args;
  const reads: { start: number; end: number }[] = [];
  const streamed: ReviewAudioClipSource = {
    sampleRate: source.sampleRate,
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    dispose() {},
    async read(start, end, signal) {
      signal.throwIfAborted();
      reads.push({ start, end });
      return {
        start,
        planes: Array.from({ length: source.numberOfChannels }, (_, channel) => {
          const plane = new Float32Array(end - start);
          const from = Math.max(0, start);
          const to = Math.min(source.length, end);
          if (to > from) plane.set(source.getChannelData(channel).subarray(from, to), from - start);
          return plane;
        }),
      };
    },
  };
  const buffered = createReviewAudioClipRenderer();
  const bounded = createReviewAudioClipRenderer();
  const padding = Math.round(source.sampleRate * 0.02);
  let previous: { to: number; buffer: AudioBuffer } | null = null;
  for (const [from, to] of windows) {
    const expected = await buffered.render(clip, source, from, to, new AbortController().signal);
    const actual = await bounded.render(clip, streamed, from, to, new AbortController().signal);
    expect(actual.sampleRate).toBe(source.sampleRate);
    expect(actual.numberOfChannels).toBe(source.numberOfChannels);
    for (let channel = 0; channel < source.numberOfChannels; channel++) {
      const actualPcm = actual.getChannelData(channel);
      expectPcmBitsEqual(actualPcm, expected.getChannelData(channel));
      if (preview) {
        const start = Math.round(from * source.sampleRate) - padding;
        const reference = new Float32Array(actual.length);
        for (let frame = 0; frame < reference.length; frame++)
          reference[frame] = preview.getChannelData(channel)[start + frame] ?? 0;
        expectPcmBitsEqual(actualPcm, reference);
      }
      if (previous?.to === from)
        expectPcmBitsEqual(
          previous.buffer.getChannelData(channel).slice(-2 * padding),
          actualPcm.slice(0, 2 * padding)
        );
    }
    previous = { to, buffer: actual };
  }
  expect(reads.length).toBeGreaterThan(2);
  expect(Math.max(...reads.map((window) => window.end - window.start))).toBeLessThanOrEqual(
    source.sampleRate * 4.1
  );
}

function expectPcmBitsEqual(actual: Float32Array, expected: Float32Array) {
  expect(actual.length).toBe(expected.length);
  const actualBits = new Uint32Array(actual.buffer, actual.byteOffset, actual.length);
  const expectedBits = new Uint32Array(expected.buffer, expected.byteOffset, expected.length);
  expect(actualBits.every((bits, index) => bits === expectedBits[index])).toBe(true);
}
