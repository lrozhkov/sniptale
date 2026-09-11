import { beforeEach, expect, it, vi } from 'vitest';
import { loadStreamingAudioPeaks } from './audio-peaks-stream';
const mocks = vi.hoisted(() => ({ samples: vi.fn(), dispose: vi.fn(), close: vi.fn() }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    getPrimaryAudioTrack = async () => ({ canDecode: async () => true });
    dispose = mocks.dispose;
  },
  AudioSampleSink: class {
    samples = mocks.samples;
  },
}));
beforeEach(() => vi.clearAllMocks());
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
