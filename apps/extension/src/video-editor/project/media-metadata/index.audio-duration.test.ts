// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Input } from 'mediabunny';
import { loadAudioMetadata } from './index';

const mocks = vi.hoisted(() => ({
  duration: vi.fn(),
  peaks: vi.fn(),
}));
vi.mock('./helpers', () => ({
  resolveMediaDuration: mocks.duration,
  loadAudioPeaks: mocks.peaks,
}));

function wav(frames: number, sampleRate: number): Blob {
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    bytes.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 2, true);
  return new Blob([bytes], { type: 'audio/wav' });
}

beforeEach(() => {
  vi.stubGlobal('document', { createElement: () => ({ src: '', preload: '' }) });
  mocks.duration.mockResolvedValue({ duration: 3.539458, isAuthoritative: true });
  mocks.peaks.mockResolvedValue([0]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('preserves the sample-exact WAV duration used by a retained voiceover take', async () => {
  const source = wav(169894, 48000);
  const original = await source.arrayBuffer();
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  const metadata = await loadAudioMetadata(source);
  expect(metadata.duration).toBe(169894 / 48000);
  expect(metadata.duration).toBeGreaterThanOrEqual(3.5394583333333287);
  expect(metadata.size).toBe(source.size);
  expect(await source.arrayBuffer()).toEqual(original);
  expect(mocks.peaks).toHaveBeenCalledWith(source, 169894 / 48000);
  expect(dispose).toHaveBeenCalledOnce();
});

it('keeps browser duration when the source is not a readable WAV', async () => {
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  const source = new Blob(['not a WAV'], { type: 'audio/mpeg' });
  const metadata = await loadAudioMetadata(source);
  expect(metadata.duration).toBe(3.539458);
  expect(mocks.peaks).toHaveBeenCalledWith(source, 3.539458);
  expect(dispose).toHaveBeenCalledOnce();
});

it('does not replace browser duration with an empty WAV duration', async () => {
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  const metadata = await loadAudioMetadata(wav(0, 48000));
  expect(metadata.duration).toBe(3.539458);
  expect(dispose).toHaveBeenCalledOnce();
});
