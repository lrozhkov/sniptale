import { beforeEach, expect, it, vi } from 'vitest';
import { loadStreamingAudioPeaks } from './audio-peaks-stream';
const mocks = vi.hoisted(() => ({
  samples: vi.fn(),
  dispose: vi.fn(),
  close: vi.fn(),
  track: vi.fn(),
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    getPrimaryAudioTrack = mocks.track;
    dispose = mocks.dispose;
  },
  AudioSampleSink: class {
    samples = mocks.samples;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.track.mockResolvedValue({ canDecode: async () => true });
});
it('uses source timestamps and every channel, retaining silence and closing decoded samples', async () => {
  mocks.samples.mockImplementation(async function* () {
    yield {
      timestamp: 1,
      sampleRate: 100,
      numberOfFrames: 2,
      numberOfChannels: 2,
      copyTo: (pcm: Float32Array, options: { planeIndex: number }) =>
        pcm.set(options.planeIndex ? [0.8, 0.2] : [0, 0]),
      close: mocks.close,
    };
  });
  const peaks = await loadStreamingAudioPeaks(new Blob(['audio']), 2);
  expect(peaks).toHaveLength(200);
  expect(peaks![100]).toBeCloseTo(0.8);
  expect(peaks![101]).toBeCloseTo(0.2);
  expect(peaks!.slice(0, 100).every((value) => value === 0)).toBe(true);
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('releases both PCM and input when decoding a chunk fails', async () => {
  mocks.samples.mockImplementation(async function* () {
    yield {
      timestamp: 0,
      sampleRate: 100,
      numberOfFrames: 2,
      numberOfChannels: 1,
      copyTo: () => {
        throw new Error('decode failed');
      },
      close: mocks.close,
    };
  });
  await expect(loadStreamingAudioPeaks(new Blob(['audio']), 2)).rejects.toThrow('decode failed');
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
});
it('excludes both outside boundaries, ignores nonfinite amplitudes and clamps valid peaks', async () => {
  mocks.samples.mockImplementation(async function* () {
    yield {
      timestamp: -0.25,
      sampleRate: 4,
      numberOfFrames: 6,
      numberOfChannels: 1,
      copyTo: (pcm: Float32Array) => pcm.set([1, 0.5, Infinity, -2, NaN, 1]),
      close: mocks.close,
    };
  });
  const peaks = await loadStreamingAudioPeaks(new Blob(['audio']), 1);
  expect(peaks![0]).toBe(0.5);
  expect(peaks![25]).toBe(0);
  expect(peaks![50]).toBe(1);
  expect(peaks![75]).toBe(0);
  expect(peaks![99]).toBe(0);
});

it.each(['missing', 'undecodable'] as const)(
  'disposes the input without starting sample decoding for a %s track',
  async (kind) => {
    mocks.track.mockResolvedValueOnce(kind === 'missing' ? null : { canDecode: async () => false });
    expect(await loadStreamingAudioPeaks(new Blob(['audio']), 2)).toBeNull();
    expect(mocks.samples).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  }
);
it('returns no waveform and disposes the input when the decoder yields no samples', async () => {
  mocks.samples.mockReturnValue([]);
  expect(await loadStreamingAudioPeaks(new Blob(['audio']), 2)).toBeNull();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(mocks.close).not.toHaveBeenCalled();
});
