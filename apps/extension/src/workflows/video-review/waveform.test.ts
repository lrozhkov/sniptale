import { afterEach, expect, it, vi } from 'vitest';
import { loadReviewWaveform } from './waveform';
const mocks = vi.hoisted(() => ({ peaks: vi.fn(), track: vi.fn(), dispose: vi.fn() }));
vi.mock('../../composition/library-preview/audio-peaks', () => ({ loadAudioPeaks: mocks.peaks }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    getPrimaryAudioTrack = mocks.track;
    dispose = mocks.dispose;
  },
}));
afterEach(() => vi.resetAllMocks());
it('uses full asset duration instead of the trimmed clip to decode bounded peaks', async () => {
  const blob = new Blob(['audio']);
  mocks.track.mockResolvedValue({ computeDuration: async () => 12 });
  mocks.peaks.mockResolvedValue([0.1, 0.8, 0.2]);
  expect(await loadReviewWaveform(blob)).toEqual({ duration: 12, peaks: [0.1, 0.8, 0.2] });
  expect(mocks.peaks).toHaveBeenCalledWith(blob, 12);
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('uses known original duration and returns no fabricated peaks for silent/unsupported media', async () => {
  mocks.peaks.mockResolvedValue(null);
  expect(await loadReviewWaveform(new Blob(), 8)).toBeNull();
  expect(mocks.track).not.toHaveBeenCalled();
  mocks.track.mockResolvedValue(null);
  expect(await loadReviewWaveform(new Blob())).toBeNull();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('releases the demuxer on malformed media without decoding an invalid duration', async () => {
  mocks.track.mockResolvedValue({ computeDuration: async () => Infinity });
  expect(await loadReviewWaveform(new Blob())).toBeNull();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(mocks.peaks).not.toHaveBeenCalled();
});
