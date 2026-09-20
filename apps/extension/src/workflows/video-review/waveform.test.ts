import { afterEach, expect, it, vi } from 'vitest';
import { loadReviewWaveform, loadReviewWaveformWindow } from './waveform';
const mocks = vi.hoisted(() => ({
  peaks: vi.fn(),
  track: vi.fn(),
  dispose: vi.fn(),
  samples: vi.fn(),
}));
vi.mock('../../composition/library-preview/audio-peaks', () => ({ loadAudioPeaks: mocks.peaks }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  AudioSampleSink: class {
    samples = mocks.samples;
  },
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
  expect(await loadReviewWaveform(blob)).toMatchObject({
    duration: 12,
    peaks: [0.1, 0.8, 0.2],
    loadWindow: expect.any(Function),
  });
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

it('streams only the requested window, retaining short impulses in bounded buckets', async () => {
  const close = vi.fn();
  mocks.track.mockResolvedValue({ canDecode: async () => true });
  mocks.samples.mockImplementation(async function* () {
    yield {
      timestamp: 1200,
      sampleRate: 4,
      numberOfFrames: 4,
      numberOfChannels: 2,
      copyTo: (out: Float32Array, options: { planeIndex: number }) =>
        out.set(options.planeIndex ? [0, 0.9, 0, 0] : [0.2, 0, 0, 0]),
      close,
    };
  });
  const result = await loadReviewWaveformWindow(
    new Blob(['audio']),
    1200,
    1201,
    100000,
    new AbortController().signal
  );
  expect(mocks.samples).toHaveBeenCalledWith(1200, 1201);
  expect(result!.peaks).toHaveLength(8192);
  expect(Math.max(...result!.peaks)).toBeCloseTo(0.9);
  expect(close).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

it('rejects invalid windows and aborts before opening the media', async () => {
  const controller = new AbortController();
  expect(await loadReviewWaveformWindow(new Blob(), -1, 2, 10, controller.signal)).toBeNull();
  controller.abort();
  await expect(loadReviewWaveformWindow(new Blob(), 0, 1, 10, controller.signal)).rejects.toThrow();
  expect(mocks.track).not.toHaveBeenCalled();
});

it('closes samples and the input when a running window is cancelled', async () => {
  const controller = new AbortController();
  const close = vi.fn();
  mocks.track.mockResolvedValue({ canDecode: async () => true });
  mocks.samples.mockImplementation(async function* () {
    controller.abort();
    yield { close };
  });
  await expect(loadReviewWaveformWindow(new Blob(), 0, 1, 10, controller.signal)).rejects.toThrow();
  expect(close).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalled();
});
