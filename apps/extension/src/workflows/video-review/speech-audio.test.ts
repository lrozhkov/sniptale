import { afterEach, expect, it, vi } from 'vitest';
import {
  encodeReviewSpeechWav,
  extractReviewSpeechWav,
  planReviewSpeechChunks,
  decodeReviewSpeechDuration,
  reviewSpeechQuietBoundary,
} from './speech-audio';
it('encodes mono PCM16 at 16 kHz with clipped signed samples and matching sizes', async () => {
  const blob = encodeReviewSpeechWav(new Float32Array([-2, -0.5, 0, 0.5, 2]));
  const view = new DataView(await blob.arrayBuffer());
  expect(blob.type).toBe('audio/wav');
  expect(view.byteLength).toBe(54);
  expect(view.getUint32(4, true)).toBe(46);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint32(40, true)).toBe(10);
  expect(Array.from({ length: 5 }, (_, index) => view.getInt16(44 + index * 2, true))).toEqual([
    -32768, -16384, 0, 16384, 32767,
  ]);
});

it('selects a quiet boundary and does not label voiced material as silence', () => {
  const pcm = new Int16Array(16000).fill(12000);
  expect(reviewSpeechQuietBoundary(pcm)).toBeNull();
  pcm.fill(0, 8000, 9600);
  expect(reviewSpeechQuietBoundary(pcm)).toBeCloseTo(0.55);
});

const decoder = vi.hoisted(() => ({
  track: true,
  samples: [] as Array<{
    numberOfChannels: number;
    numberOfFrames: number;
    sampleRate: number;
    timestamp: number;
    copyTo: (plane: Float32Array, options: { planeIndex: number }) => void;
    close: ReturnType<typeof vi.fn>;
  }>,
  dispose: vi.fn(),
  bytes: vi.fn(),
}));
vi.mock('./asset-bytes', () => ({ resolveReviewAssetBytes: decoder.bytes }));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    getPrimaryAudioTrack() {
      return decoder.track ? {} : null;
    }
    dispose() {
      decoder.dispose();
    }
  },
  AudioSampleSink: class {
    async *samples() {
      for (const sample of decoder.samples) yield sample;
    }
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  decoder.track = true;
  decoder.samples = [];
});
it('decodes just the requested interval, downmixes channels and releases each decoded sample', async () => {
  decoder.bytes.mockResolvedValue(new Blob(['source']));
  const close = vi.fn();
  decoder.samples = [
    {
      numberOfChannels: 2,
      numberOfFrames: 4,
      sampleRate: 16000,
      timestamp: 2,
      copyTo: (plane, options) => plane.fill(options.planeIndex === 0 ? 0.5 : -0.25),
      close,
    },
  ];
  const wav = await extractReviewSpeechWav('asset', 2, 2.00025, new AbortController().signal);
  expect(Array.from(new Int16Array(await wav.arrayBuffer(), 44))).toEqual([4096, 4096, 4096, 4096]);
  expect(close).toHaveBeenCalledOnce();
  expect(decoder.dispose).toHaveBeenCalled();
});
it('rejects unavailable, invalid and cancelled decode work without retaining a decoder', async () => {
  const signal = new AbortController().signal;
  for (const [a, b] of [
    [NaN, 1],
    [0, NaN],
    [-1, 1],
    [2, 1],
    [0, 301],
  ])
    await expect(extractReviewSpeechWav('asset', a!, b!, signal)).rejects.toThrow(
      'invalid-request'
    );
  decoder.bytes.mockResolvedValue(null);
  await expect(extractReviewSpeechWav('asset', 0, 1, signal)).rejects.toThrow('missing-media');
  decoder.bytes.mockResolvedValue(new Blob(['source']));
  decoder.track = false;
  await expect(extractReviewSpeechWav('asset', 0, 1, signal)).rejects.toThrow('invalid-response');
  decoder.track = true;
  await expect(extractReviewSpeechWav('asset', 0, 1, signal)).rejects.toThrow('invalid-response');
  const controller = new AbortController();
  controller.abort();
  await expect(extractReviewSpeechWav('asset', 0, 1, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
it('uses quiet local windows to bound chunk requests and preserves separate native ranges', async () => {
  decoder.bytes.mockResolvedValue(new Blob(['source']));
  decoder.samples = [
    {
      numberOfChannels: 1,
      numberOfFrames: 64000,
      sampleRate: 16000,
      timestamp: 56,
      copyTo: (plane) => plane.fill(0),
      close: vi.fn(),
    },
  ];
  const ranges = await planReviewSpeechChunks(
    'asset',
    [
      { start: 0, end: 61 },
      { start: 70, end: 72 },
    ],
    new AbortController().signal
  );
  expect(ranges).toEqual([
    { start: 0, end: 59.95 },
    { start: 59.95, end: 61 },
    { start: 70, end: 72 },
  ]);
  decoder.samples[0]!.copyTo = (plane) => plane.fill(0.5);
  expect(
    await planReviewSpeechChunks('asset', [{ start: 0, end: 61 }], new AbortController().signal)
  ).toEqual([
    { start: 0, end: 60 },
    { start: 60, end: 61 },
  ]);
});
it('measures generated duration from decoded PCM and closes contexts on malformed output', async () => {
  const close = vi.fn(async () => undefined);
  let duration = 1.5;
  vi.stubGlobal(
    'AudioContext',
    class {
      close = close;
      async decodeAudioData() {
        return { duration };
      }
    }
  );
  expect(await decodeReviewSpeechDuration(new Blob(['audio']))).toBe(1.5);
  for (duration of [NaN, 0, 301])
    await expect(decodeReviewSpeechDuration(new Blob(['audio']))).rejects.toThrow(
      'invalid-response'
    );
  expect(close).toHaveBeenCalledTimes(4);
});

it('extracts the already-bound original Blob without acquiring or copying a Library asset', async () => {
  decoder.bytes.mockClear();
  const close = vi.fn();
  decoder.samples = [
    {
      numberOfChannels: 1,
      numberOfFrames: 4,
      sampleRate: 16000,
      timestamp: 3,
      copyTo: (plane) => plane.fill(0.5),
      close,
    },
  ];
  const wav = await extractReviewSpeechWav(
    new Blob(['original video']),
    3,
    3.00025,
    new AbortController().signal
  );
  expect(Array.from(new Int16Array(await wav.arrayBuffer(), 44))).toEqual([
    16384, 16384, 16384, 16384,
  ]);
  expect(decoder.bytes).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(decoder.dispose).toHaveBeenCalled();
});
