import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Input, InputAudioTrack, InputVideoTrack } from 'mediabunny';
import { inspectReviewPresentationVideo } from './presentation-admission';

const decode = vi.hoisted(() => vi.fn());
vi.mock('mediabunny', async (original) => ({
  ...(await original<typeof import('mediabunny')>()),
  VideoSampleSink: class {
    getSample = decode;
  },
}));
function sample(time: number) {
  return {
    timestamp: time,
    duration: 1 / 30,
    displayWidth: 160,
    displayHeight: 90,
    close: vi.fn(),
  };
}
async function fixture() {
  return new Blob([await readFile('tooling/test/e2e/fixtures/review-avc-aac.mp4')]);
}
beforeEach(() => {
  decode.mockReset().mockImplementation(async (time: number) => sample(time));
  vi.spyOn(InputVideoTrack.prototype, 'canDecode').mockResolvedValue(true);
  vi.spyOn(InputAudioTrack.prototype, 'canDecode').mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('admits real container metadata and probes only the native trim endpoints', async () => {
  const file = await fixture();
  const samples: ReturnType<typeof sample>[] = [];
  decode.mockImplementation(async (time: number) => {
    const value = sample(time);
    samples.push(value);
    return value;
  });
  vi.spyOn(InputVideoTrack.prototype, 'getTimeResolution').mockResolvedValue(30000);
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  const result = await inspectReviewPresentationVideo(file, new AbortController().signal, {
    trim: { start: 1, end: 2 },
  });
  expect(result).toEqual({
    source: { width: 160, height: 90, duration: 12, size: file.size, mimeType: 'video/mp4' },
    hasAudio: true,
  });
  expect(decode.mock.calls.map(([time]) => time)).toEqual([1, 59999 / 30000]);
  expect(samples.every((value) => value.close.mock.calls.length === 1)).toBe(true);
  expect(dispose).toHaveBeenCalledOnce();
});

it.each([0, 512 * 1024 * 1024 + 1])('rejects byte size %s before opening media', async (size) => {
  const file = new Blob(['x']);
  vi.spyOn(file, 'size', 'get').mockReturnValue(size);
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  await expect(
    inspectReviewPresentationVideo(file, new AbortController().signal)
  ).rejects.toMatchObject({ code: 'size' });
  expect(dispose).not.toHaveBeenCalled();
});

it.each([0, NaN, 16385, 1.5, 10000])(
  'rejects invalid/oversized video dimensions %s',
  async (width) => {
    vi.spyOn(InputVideoTrack.prototype, 'getDisplayWidth').mockResolvedValue(width);
    vi.spyOn(InputVideoTrack.prototype, 'getDisplayHeight').mockResolvedValue(5000);
    const dispose = vi.spyOn(Input.prototype, 'dispose');
    await expect(
      inspectReviewPresentationVideo(await fixture(), new AbortController().signal)
    ).rejects.toMatchObject({ code: 'dimensions' });
    expect(dispose).toHaveBeenCalledOnce();
    expect(decode).not.toHaveBeenCalled();
  }
);

it.each([0, NaN, Infinity, 3600.01])('rejects invalid video duration %s', async (duration) => {
  vi.spyOn(InputVideoTrack.prototype, 'computeDuration').mockResolvedValue(duration);
  await expect(
    inspectReviewPresentationVideo(await fixture(), new AbortController().signal)
  ).rejects.toMatchObject({ code: 'duration' });
});

it('rejects missing or extra video tracks', async () => {
  const original = Input.prototype.getVideoTracks;
  const file = await fixture();
  vi.spyOn(Input.prototype, 'getVideoTracks').mockImplementation(async function (this: Input) {
    const tracks = await original.call(this);
    return [...tracks, ...tracks];
  });
  await expect(
    inspectReviewPresentationVideo(file, new AbortController().signal)
  ).rejects.toMatchObject({ code: 'tracks' });
  vi.mocked(Input.prototype.getVideoTracks).mockResolvedValue([]);
  await expect(
    inspectReviewPresentationVideo(file, new AbortController().signal)
  ).rejects.toMatchObject({ code: 'tracks' });
});

it('rejects extra audio tracks even when muted', async () => {
  const original = Input.prototype.getAudioTracks;
  vi.spyOn(Input.prototype, 'getAudioTracks').mockImplementation(async function (this: Input) {
    const tracks = await original.call(this);
    return [...tracks, ...tracks];
  });
  await expect(
    inspectReviewPresentationVideo(await fixture(), new AbortController().signal, { muted: true })
  ).rejects.toMatchObject({ code: 'tracks' });
});

it('allows explicit mute readmission when audio decoding is unsupported', async () => {
  vi.mocked(InputAudioTrack.prototype.canDecode).mockResolvedValue(false);
  const file = await fixture();
  await expect(
    inspectReviewPresentationVideo(file, new AbortController().signal)
  ).rejects.toMatchObject({ code: 'audio-decoder' });
  vi.mocked(InputAudioTrack.prototype.canDecode).mockClear();
  expect(
    (await inspectReviewPresentationVideo(file, new AbortController().signal, { muted: true }))
      .hasAudio
  ).toBe(true);
  expect(InputAudioTrack.prototype.canDecode).not.toHaveBeenCalled();
});

it.each(['channels', 'rate'] as const)('rejects inadmissible audio %s', async (field) => {
  if (field === 'channels')
    vi.spyOn(InputAudioTrack.prototype, 'getNumberOfChannels').mockResolvedValue(9);
  else vi.spyOn(InputAudioTrack.prototype, 'getSampleRate').mockResolvedValue(192001);
  await expect(
    inspectReviewPresentationVideo(await fixture(), new AbortController().signal)
  ).rejects.toMatchObject({ code: 'audio-decoder' });
});

it('refuses an unavailable video decoder', async () => {
  vi.mocked(InputVideoTrack.prototype.canDecode).mockResolvedValue(false);
  await expect(
    inspectReviewPresentationVideo(await fixture(), new AbortController().signal)
  ).rejects.toMatchObject({ code: 'video-decoder' });
  expect(decode).not.toHaveBeenCalled();
});

it.each([
  { start: -1, end: 2 },
  { start: 1, end: 13 },
  { start: 1, end: 1 },
  { start: NaN, end: 2 },
  { start: 1.1 / 30, end: 1.2 / 30 },
])('refuses invalid or untickable trim %j', async (trim) => {
  vi.spyOn(InputVideoTrack.prototype, 'getTimeResolution').mockResolvedValue(30);
  await expect(
    inspectReviewPresentationVideo(await fixture(), new AbortController().signal, { trim })
  ).rejects.toMatchObject({ code: 'trim' });
  expect(decode).not.toHaveBeenCalled();
});

it.each(['missing', 'after', 'stale', 'nonfinite', 'dimensions'] as const)(
  'rejects %s samples at requested endpoints',
  async (kind) => {
    const value = sample(1);
    if (kind === 'after') value.timestamp = 1.1;
    if (kind === 'stale') value.duration = 0.01;
    if (kind === 'nonfinite') value.timestamp = NaN;
    if (kind === 'dimensions') value.displayWidth = 1;
    decode.mockImplementation(async (time: number) =>
      kind === 'missing' ? null : kind === 'stale' && time === 1 ? sample(1) : value
    );
    await expect(
      inspectReviewPresentationVideo(await fixture(), new AbortController().signal, {
        trim: { start: 1, end: 2 },
      })
    ).rejects.toMatchObject({ code: 'decode' });
    expect(value.close).toHaveBeenCalledTimes(kind === 'missing' ? 0 : 1);
  }
);

it('closes a pending sample that resolves after cancellation', async () => {
  const controller = new AbortController();
  let complete!: (value: ReturnType<typeof sample>) => void;
  decode.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  const operation = inspectReviewPresentationVideo(await fixture(), controller.signal);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
  controller.abort();
  await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  expect(dispose).toHaveBeenCalled();
  const late = sample(0);
  complete(late);
  await vi.waitFor(() => expect(late.close).toHaveBeenCalledOnce());
});

it('honors cancellation before opening an input', async () => {
  const controller = new AbortController();
  controller.abort();
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  await expect(
    inspectReviewPresentationVideo(await fixture(), controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(dispose).not.toHaveBeenCalled();
});

it('returns a fixed decode failure instead of leaking a decoder exception', async () => {
  decode.mockRejectedValue(new Error('private source metadata'));
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  await expect(
    inspectReviewPresentationVideo(await fixture(), new AbortController().signal)
  ).rejects.toMatchObject({ code: 'decode', message: 'presentation-media:decode' });
  expect(dispose).toHaveBeenCalledOnce();
});

it('enforces the 30-second admission deadline and closes a late decoded sample', async () => {
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  let complete!: (value: ReturnType<typeof sample>) => void;
  decode.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const operation = inspectReviewPresentationVideo(await fixture(), new AbortController().signal);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
  expect(timeout).toHaveBeenCalledWith(30_000);
  deadline.abort(new DOMException('Admission timed out', 'TimeoutError'));
  await expect(operation).rejects.toMatchObject({ name: 'TimeoutError' });
  const late = sample(0);
  complete(late);
  await vi.waitFor(() => expect(late.close).toHaveBeenCalledOnce());
});

it('accepts native samples crossing a trim boundary when they cover the requested time', async () => {
  const frames = [sample(0.98), sample(1.98)];
  decode.mockResolvedValueOnce(frames[0]).mockResolvedValueOnce(frames[1]);
  const result = await inspectReviewPresentationVideo(
    await fixture(),
    new AbortController().signal,
    { trim: { start: 1, end: 2 } }
  );
  expect(result.source.duration).toBe(12);
  expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
});
