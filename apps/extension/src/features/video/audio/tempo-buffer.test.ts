import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderTempoBuffer } from './tempo-buffer';

class Pcm {
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly planes: Float32Array[];
  constructor(options: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.numberOfChannels = options.numberOfChannels;
    this.planes = Array.from(
      { length: this.numberOfChannels },
      () => new Float32Array(this.length)
    );
  }
  getChannelData(c: number) {
    return this.planes[c]!;
  }
}
beforeEach(() => vi.stubGlobal('AudioBuffer', Pcm));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('renders the selected source interval to its exact tempo duration without touching source PCM', async () => {
  const buffer = new AudioBuffer({ length: 48000, sampleRate: 48000, numberOfChannels: 2 });
  buffer.getChannelData(0).fill(0.5);
  buffer.getChannelData(1).fill(-0.5);
  const result = await renderTempoBuffer(buffer, { start: 0.1, duration: 0.8, rate: 2 });
  expect(result.length).toBe(19200);
  expect(result.getChannelData(0).every((v) => v === 0.5)).toBe(true);
  expect(result.getChannelData(1).every((v) => v === -0.5)).toBe(true);
  expect(buffer.length).toBe(48000);
});
it('aborts between processing chunks before publishing a partial buffer', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const buffer = new AudioBuffer({ length: 48000 * 6, sampleRate: 48000, numberOfChannels: 1 });
  const pending = renderTempoBuffer(buffer, { start: 0, duration: 6, rate: 2 }, controller.signal);
  const rejected = expect(pending).rejects.toThrow('cancelled');
  controller.abort(new Error('cancelled'));
  await vi.runAllTimersAsync();
  await rejected;
});
