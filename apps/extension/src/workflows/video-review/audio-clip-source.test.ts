import { beforeEach, expect, it, vi } from 'vitest';
import { openReviewAudioClipSource } from './audio-clip-source';
const io = vi.hoisted(() => ({
  dispose: vi.fn(),
  close: vi.fn(),
  samples: vi.fn(),
  track: vi.fn(),
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose = io.dispose;
    getPrimaryAudioTrack = io.track;
  },
  AudioSampleSink: class {
    samples = io.samples;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  io.track.mockResolvedValue({
    canDecode: async () => true,
    getSampleRate: async () => 48000,
    getNumberOfChannels: async () => 1,
    computeDuration: async () => 7200,
  });
  io.samples.mockImplementation(async function* (start: number, end: number) {
    yield {
      timestamp: start,
      sampleRate: 48000,
      numberOfChannels: 1,
      numberOfFrames: Math.ceil((end - start) * 48000),
      close: io.close,
      copyTo(destination: Float32Array) {
        destination.fill(0.25);
      },
    };
  });
});
it.each([
  [0.07, 44100, 3087],
  [0.05, 44100, 2205],
  [0.07001, 44100, 3088],
  [0.07, 48000, 3360],
  [1e-20, 44100, 1],
])('admits %ss at %sHz on its native frame grid (%s frames)', async (duration, rate, frames) => {
  io.track.mockResolvedValue({
    canDecode: async () => true,
    getSampleRate: async () => rate,
    getNumberOfChannels: async () => 1,
    computeDuration: async () => duration,
  });
  const source = await openReviewAudioClipSource(new Blob(), new AbortController().signal);
  expect(source.length).toBe(frames);
  source.dispose();
});
it('seeks late intervals with bounded PCM and never decodes complete long source', async () => {
  const controller = new AbortController();
  const source = await openReviewAudioClipSource(new Blob(), controller.signal);
  const start = 7100 * 48000;
  const result = await source.read(start, start + 48000, controller.signal);
  expect(result.planes[0]!.length).toBe(48000);
  expect(result.planes[0]![0]).toBe(0.25);
  expect(io.samples).toHaveBeenCalledWith(7099.92, 7101);
  expect(io.close).toHaveBeenCalledOnce();
  await expect(source.read(0, 48000 * 6, controller.signal)).rejects.toThrow('bounded');
  source.dispose();
  source.dispose();
  expect(io.dispose).toHaveBeenCalledOnce();
});
it('disposes interrupted admission and rejects later reads', async () => {
  const controller = new AbortController();
  io.track.mockImplementation(async () => {
    controller.abort();
    return null;
  });
  await expect(openReviewAudioClipSource(new Blob(), controller.signal)).rejects.toThrow();
  expect(io.dispose).toHaveBeenCalledOnce();
});
it('closes the decoder on cancellation after admission', async () => {
  const controller = new AbortController();
  const source = await openReviewAudioClipSource(new Blob(), controller.signal);
  controller.abort();
  expect(io.dispose).toHaveBeenCalledOnce();
  await expect(source.read(0, 48000, controller.signal)).rejects.toThrow();
  source.dispose();
  expect(io.dispose).toHaveBeenCalledOnce();
});

it.each([
  { rate: NaN, channels: 1, duration: 1 },
  { rate: 48000, channels: 1.5, duration: 1 },
  { rate: 48000, channels: 1, duration: Number.MAX_SAFE_INTEGER },
])('rejects unsafe source metadata %j', async (values) => {
  io.track.mockResolvedValue({
    canDecode: async () => true,
    getSampleRate: async () => values.rate,
    getNumberOfChannels: async () => values.channels,
    computeDuration: async () => values.duration,
  });
  await expect(openReviewAudioClipSource(new Blob(), new AbortController().signal)).rejects.toThrow(
    'Invalid'
  );
  expect(io.dispose).toHaveBeenCalledOnce();
  expect(io.samples).not.toHaveBeenCalled();
});
it('clips an overlapping120ms packet and preserves actual timestamp gaps as silence', async () => {
  io.samples.mockImplementation(async function* () {
    for (const [timestamp, duration, value] of [
      [0.84, 0.12, 0.5],
      [1.02, 0.02, 0.75],
    ])
      yield {
        timestamp,
        sampleRate: 48000,
        numberOfChannels: 1,
        numberOfFrames: Math.round(duration! * 48000),
        close: io.close,
        copyTo(destination: Float32Array) {
          destination.fill(value!);
        },
      };
  });
  const controller = new AbortController();
  const source = await openReviewAudioClipSource(new Blob(), controller.signal);
  const result = await source.read(0.95 * 48000, 1.03 * 48000, controller.signal);
  const plane = result.planes[0]!;
  expect([...plane.slice(0, 480)].every((value) => value === 0.5)).toBe(true);
  expect([...plane.slice(480, 3360)].every((value) => value === 0)).toBe(true);
  expect([...plane.slice(3360)].every((value) => value === 0.75)).toBe(true);
  expect(io.close).toHaveBeenCalledTimes(2);
  source.dispose();
});
