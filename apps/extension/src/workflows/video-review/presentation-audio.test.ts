import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, AudioSample, BlobSource, Input, type InputAudioTrack } from 'mediabunny';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import {
  createNeutralPresentationSettings,
  type QuickEditPresentationSettings,
} from '../../features/video/review/advanced/presentation';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { renderReviewAudio } from './audio-render';
import {
  probePresentationAudio,
  renderPresentationAudio,
  type PresentationAudioInput,
} from './presentation-audio';

const mock = vi.hoisted(() => ({ render: vi.fn(), encode: vi.fn() }));
vi.mock('./audio-render', () => ({ renderReviewAudio: mock.render }));
vi.mock('mediabunny', async (original) => ({
  ...(await original<typeof import('mediabunny')>()),
  canEncodeAudio: mock.encode,
}));
let input: Input;
let track: InputAudioTrack;
beforeAll(async () => {
  input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(
      new Blob([await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm')])
    ),
  });
  const audio = await input.getPrimaryAudioTrack();
  if (!audio) throw new Error('Missing audio fixture.');
  track = audio;
});
afterAll(() => input.dispose());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  mock.render.mockReset();
  mock.encode.mockReset().mockResolvedValue(true);
  vi.stubGlobal('OfflineAudioContext', class {});
  vi.mocked(renderReviewAudio).mockImplementation(async function* (_track, segment) {
    const count = Math.round((segment.resultEnd - segment.resultStart) * 48_000);
    const value = segment.sourceStart === 2 ? 0.25 : segment.sourceStart === 4 ? -0.25 : 0.5;
    const sample = pcm([value], count, segment.resultStart);
    try {
      yield sample;
    } finally {
      sample.close();
    }
  });
});
function pcm(values: number[], frames: number, timestamp = 0) {
  const data = new Float32Array(values.length * frames);
  values.forEach((value, channel) => data.fill(value, channel * frames, (channel + 1) * frames));
  return new AudioSample({
    data,
    format: 'f32-planar',
    numberOfChannels: values.length,
    sampleRate: 48_000,
    timestamp,
  });
}
function clipBuffer(): AudioBuffer {
  const plane = new Float32Array(4800);
  return {
    duration: 0.1,
    length: plane.length,
    sampleRate: 48_000,
    numberOfChannels: 1,
    getChannelData: () => plane,
    copyFromChannel: (destination, _channel, offset = 0) => {
      destination.set(plane.subarray(offset, offset + destination.length));
    },
    copyToChannel: (source, _channel, offset = 0) => {
      plane.set(source, offset);
    },
  };
}
function video(start: number, duration: number): QuickEditPresentationSettings['intro'] {
  return {
    mode: 'video',
    video: {
      assetId: 'asset',
      source: { duration: 20, width: 1280, height: 720, mimeType: 'video/webm', size: 10 },
      trim: { start, end: start + duration },
      audio: { muted: false, gain: 1 },
      fit: 'contain',
      fillColor: '#000000',
      crop: { panX: 0, panY: 0 },
    },
  };
}
function request(
  options: { duration?: number; bookends?: boolean; fade?: boolean; rate?: number } = {}
): PresentationAudioInput {
  const duration = options.duration ?? 0.1;
  const settings = createNeutralPresentationSettings();
  if (options.bookends) {
    settings.intro = video(2, 0.1);
    settings.outro = video(4, 0.1);
  }
  if (options.fade) {
    settings.fadeIn = { enabled: true, duration: 0.4 };
    settings.fadeOut = { enabled: true, duration: 0.4 };
    settings.audioFade = true;
  }
  const result = planReviewPresentationSequence({
    settings,
    mainDuration: duration,
    fragmentOffset: 7,
    includeBookends: true,
    rate: { numerator: options.rate ?? 30000, denominator: options.rate ? 1 : 1001 },
  });
  if (!result.ok) throw new Error('Invalid fixture plan.');
  return {
    plan: result.plan,
    main: { track, segments: buildReviewTimeMap(duration, []), isOriginalMuted: () => false },
    bookends: { intro: { track, muted: false, gain: 1 }, outro: { track, muted: false, gain: 1 } },
    signal: new AbortController().signal,
  };
}
async function collect(args: PresentationAudioInput) {
  const left: number[] = [],
    right: number[] = [],
    starts: number[] = [],
    counts: number[] = [];
  for await (const sample of renderPresentationAudio(args)) {
    expect(sample.numberOfChannels).toBe(2);
    expect(sample.sampleRate).toBe(48_000);
    expect(sample.numberOfFrames).toBeLessThanOrEqual(48_000);
    starts.push(Math.round(sample.timestamp * 48_000));
    counts.push(sample.numberOfFrames);
    for (const [channel, target] of [left, right].entries()) {
      const plane = new Float32Array(sample.numberOfFrames);
      sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar' });
      target.push(...plane);
    }
  }
  return { left, right, starts, counts };
}

it('decodes only a late preview window and keeps absolute sequence timestamps', async () => {
  const args = request({ duration: 3600 });
  args.window = { start: 3598 * 48000, end: 3600 * 48000 };
  const result = await collect(args);
  expect(result.left).toHaveLength(96000);
  expect(result.starts).toEqual([3598 * 48000, 3599 * 48000]);
  expect(mock.render).toHaveBeenCalledTimes(1);
  expect(mock.render.mock.calls[0]?.[1]).toMatchObject({
    sourceStart: 3598,
    sourceEnd: 3600,
    resultStart: 3598,
    resultEnd: 3600,
  });
});

it('keeps full-sequence fade samples when rendering a cropped window', async () => {
  const args = request({ fade: true });
  const full = await collect(args);
  const cropped = await collect({ ...args, window: { start: 123, end: 4321 } });
  expect(cropped.left).toEqual(full.left.slice(123, 4321));
  expect(cropped.starts[0]).toBe(123);
});

it('clips both sides of a join and retains its quantized silence', async () => {
  vi.mocked(renderReviewAudio).mockImplementation(async function* (_track, segment) {
    const value = segment.sourceStart >= 4 ? -0.25 : segment.sourceStart >= 2 ? 0.25 : 0.5;
    const sample = pcm(
      [value],
      Math.round((segment.resultEnd - segment.resultStart) * 48000),
      segment.resultStart
    );
    try {
      yield sample;
    } finally {
      sample.close();
    }
  });
  const args = request({ bookends: true });
  const full = await collect(args);
  mock.render.mockClear();
  const cropped = await collect({ ...args, window: { start: 4750, end: 9650 } });
  expect(cropped.left).toEqual(full.left.slice(4750, 9650));
  expect(cropped.counts.reduce((total, count) => total + count, 0)).toBe(4900);
  expect(mock.render).toHaveBeenCalledTimes(3);
});

it('does not decode content before a window entirely within a visual hold', async () => {
  const args = request({ bookends: true });
  args.window = { start: 4800, end: 4805 };
  const result = await collect(args);
  expect(result.left).toEqual([0, 0, 0, 0, 0]);
  expect(mock.render).not.toHaveBeenCalled();
  expect(await probePresentationAudio(args, 'webm')).toMatchObject({ audible: false });
});

it.each([
  { start: -1, end: 10 },
  { start: 0.5, end: 10 },
  { start: 0, end: 4801 },
  { start: 10, end: 10 },
])('rejects an invalid audio preview window %j', async (window) => {
  const args = { ...request(), window };
  await expect(collect(args)).rejects.toThrow('Invalid presentation audio window');
  await expect(probePresentationAudio(args, 'webm')).rejects.toThrow(
    'Invalid presentation audio window'
  );
  expect(mock.render).not.toHaveBeenCalled();
});

it('places independent tones on absolute NTSC boundaries with silence for visual holds', async () => {
  const result = await collect(request({ bookends: true }));
  expect(result.left).toHaveLength(14400);
  expect(result.left.slice(0, 4800).every((v) => v === 0.25)).toBe(true);
  expect(result.left.slice(4800, 4805)).toEqual([0, 0, 0, 0, 0]);
  expect(result.left.slice(4805, 9605).every((v) => v === 0.5)).toBe(true);
  expect(result.left.slice(9605, 9610)).toEqual([0, 0, 0, 0, 0]);
  expect(result.left.slice(9610).every((v) => v === -0.25)).toBe(true);
  expect(result.right).toEqual(result.left);
});

it.each([
  [1, [0.6], [0.6, 0.6]],
  [2, [0.2, -0.4], [0.2, -0.4]],
  [3, [0.2, -0.4, 0.6], [0.4, -0.4]],
  [8, [2, -2, 2, -2, 2, -2, 2, -2], [1, -1]],
] as const)(
  'folds %i channels and clamps only the completed stereo mix',
  async (_channels, values, expected) => {
    vi.mocked(renderReviewAudio).mockImplementation(async function* () {
      const sample = pcm([...values], 4800);
      try {
        yield sample;
      } finally {
        sample.close();
      }
    });
    const result = await collect(request());
    expect(result.left[0]).toBeCloseTo(expected[0]);
    expect(result.right[0]).toBeCloseTo(expected[1]);
  }
);

it('applies the global envelope once after limiting and reaches exact first/last silence', async () => {
  vi.mocked(renderReviewAudio).mockImplementation(async function* () {
    const sample = pcm([2], 4800);
    try {
      yield sample;
    } finally {
      sample.close();
    }
  });
  const result = await collect(request({ fade: true }));
  expect(result.left[0]).toBe(0);
  expect(result.left.at(-1)).toBe(0);
  expect(result.left[1200]).toBeCloseTo(1200 / 2399.5);
});

it('silence-fills missing and short audio and keeps windows bounded through exact total end', async () => {
  const args = request({ duration: 2.105, rate: 30 });
  vi.mocked(renderReviewAudio).mockImplementation(async function* () {
    const sample = pcm([0.3], 2400);
    try {
      yield sample;
    } finally {
      sample.close();
    }
  });
  const result = await collect(args);
  expect(result.left).toHaveLength(101040);
  expect(result.left.slice(2400).every((v) => v === 0)).toBe(true);
  expect(result.starts.map((start, index) => start + result.counts[index]!)).toEqual([
    ...result.starts.slice(1),
    101040,
  ]);
  args.main.track = null;
  mock.render.mockClear();
  expect((await collect(args)).left.every((v) => v === 0)).toBe(true);
  expect(mock.render).not.toHaveBeenCalled();
});

it('keeps cuts/speeds and clip automation on main-local clocks independent of intro and fragment offset', async () => {
  const args = request({ duration: 1.25, bookends: true });
  args.main.segments = buildReviewTimeMap(2.5, [
    { id: 'cut', kind: 'cut', start: 0, end: 0.5, requestedStart: 0, requestedEnd: 0.5 },
    {
      id: 'speed',
      kind: 'speed',
      start: 0.5,
      end: 2,
      requestedStart: 0.5,
      requestedEnd: 2,
      rate: 2,
      audio: 'mute',
    },
  ]);
  args.main.isOriginalMuted = (segment) => segment.kind === 'speed';
  const buffers = new Map([['voice', clipBuffer()]]);
  args.main.exportAudio = {
    entries: [
      {
        lane: 'voiceover',
        clipId: 'voice',
        assetId: 'voice',
        timelineStart: 0,
        duration: 1.25,
        sourceOffset: 0,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      },
    ],
    buffers,
    originalMuted: false,
    originalVolume: 0.75,
  };
  await collect(args);
  const calls = vi
    .mocked(renderReviewAudio)
    .mock.calls.filter((call) => call[4] === args.main.exportAudio);
  expect(
    calls.map((call) => [
      call[1].sourceStart,
      call[1].sourceEnd,
      call[1].resultStart,
      call[1].resultEnd,
      call[1].rate,
      call[2],
    ])
  ).toEqual([
    [0.5, 2, 0, 0.75, 2, true],
    [2, 2.5, 0.75, 1.25, 1, false],
  ]);
  expect(calls[0]![4]).toBe(args.main.exportAudio);
});

it('does not mute external clips when original audio is muted and forwards bookend gain/trim', async () => {
  const args = request({ bookends: true });
  const buffer = clipBuffer();
  args.main.exportAudio = {
    originalMuted: true,
    originalVolume: 1,
    buffers: new Map([['music', buffer]]),
    entries: [
      {
        lane: 'music',
        clipId: 'clip',
        assetId: 'music',
        timelineStart: 0,
        duration: 0.1,
        sourceOffset: 0,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      },
    ],
  };
  args.bookends.intro = { track, muted: false, gain: 0.7 };
  await collect(args);
  const main = vi
    .mocked(renderReviewAudio)
    .mock.calls.find((call) => call[4] === args.main.exportAudio)!;
  expect(main[2]).toBe(true);
  expect(main[4]).toBe(args.main.exportAudio);
  const intro = vi.mocked(renderReviewAudio).mock.calls[0]!;
  expect(intro[1]).toMatchObject({ sourceStart: 2, sourceEnd: 2.1, resultStart: 0, rate: 1 });
  expect(intro[4]?.originalVolume).toBe(0.7);
});

it('closes input and output leases on early return without disposing the borrowed input', async () => {
  const source = pcm([0.2], 4800);
  const closed = vi.spyOn(source, 'close');
  const dispose = vi.spyOn(input, 'dispose');
  vi.mocked(renderReviewAudio).mockImplementation(async function* () {
    try {
      yield source;
    } finally {
      source.close();
    }
  });
  const iterator = renderPresentationAudio(request());
  const first = await iterator.next();
  if (first.done) throw new Error('Missing sample.');
  const outputClosed = vi.spyOn(first.value, 'close');
  await iterator.return(undefined);
  expect(closed).toHaveBeenCalledOnce();
  expect(outputClosed).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();
});

it('propagates cancellation and decoder failures and closes in-flight samples', async () => {
  const args = request();
  const controller = new AbortController();
  args.signal = controller.signal;
  const sample = pcm([0.2], 4800);
  const closed = vi.spyOn(sample, 'close');
  vi.mocked(renderReviewAudio).mockImplementation(async function* () {
    try {
      controller.abort(new Error('cancel'));
      yield sample;
    } finally {
      sample.close();
    }
  });
  await expect(collect(args)).rejects.toThrow('cancel');
  expect(closed).toHaveBeenCalledOnce();
  vi.mocked(renderReviewAudio).mockImplementation(async function* () {
    yield await Promise.reject(new Error('decode'));
  });
  await expect(collect(request())).rejects.toThrow('decode');
});

it('probes stereo codec independently when only a bookend is audible', async () => {
  const args = request({ bookends: true });
  args.main.track = null;
  vi.spyOn(track, 'getNumberOfChannels').mockResolvedValue(6);
  vi.spyOn(track, 'getSampleRate').mockResolvedValue(44100);
  vi.spyOn(track, 'canDecode').mockResolvedValue(true);
  expect(await probePresentationAudio(args, 'mp4')).toEqual({
    audible: true,
    multichannel: true,
    codec: 'aac',
  });
  expect(mock.encode).toHaveBeenCalledWith('aac', { numberOfChannels: 2, sampleRate: 48000 });
  mock.encode.mockResolvedValue(false);
  expect((await probePresentationAudio(args, 'webm')).codec).toBeNull();
});

it('omits capability work for an explicitly silent sequence and rejects unsupported active input', async () => {
  const args = request();
  args.main.isOriginalMuted = () => true;
  expect(await probePresentationAudio(args, 'webm')).toEqual({
    audible: false,
    multichannel: false,
    codec: null,
  });
  expect(mock.encode).not.toHaveBeenCalled();
  args.main.isOriginalMuted = () => false;
  vi.spyOn(track, 'getNumberOfChannels').mockResolvedValue(9);
  await expect(probePresentationAudio(args, 'webm')).rejects.toThrow(
    'Unsupported presentation audio input.'
  );
});

it('closes the input lease when malformed PCM is rejected', async () => {
  const sample = pcm([Number.NaN], 4800);
  const closed = vi.spyOn(sample, 'close');
  vi.mocked(renderReviewAudio).mockImplementation(async function* () {
    try {
      yield sample;
    } finally {
      sample.close();
    }
  });
  await expect(collect(request())).rejects.toThrow('Invalid presentation audio PCM.');
  expect(closed).toHaveBeenCalledOnce();
});

it.each([7999, 192001, Number.NaN])('rejects an active source sample rate %s', async (rate) => {
  vi.spyOn(track, 'getNumberOfChannels').mockResolvedValue(2);
  vi.spyOn(track, 'getSampleRate').mockResolvedValue(rate);
  await expect(probePresentationAudio(request(), 'webm')).rejects.toThrow(
    'Unsupported presentation audio input.'
  );
});

it('rejects undecodable active audio and preserves an abort arriving during capability probing', async () => {
  vi.spyOn(track, 'getNumberOfChannels').mockResolvedValue(2);
  vi.spyOn(track, 'getSampleRate').mockResolvedValue(48000);
  const decode = vi.spyOn(track, 'canDecode').mockResolvedValue(false);
  await expect(probePresentationAudio(request(), 'mp4')).rejects.toThrow(
    'Unsupported presentation audio input.'
  );
  decode.mockResolvedValue(true);
  const args = request();
  const controller = new AbortController();
  args.signal = controller.signal;
  mock.encode.mockImplementation(async () => {
    controller.abort(new Error('cancel probe'));
    return true;
  });
  await expect(probePresentationAudio(args, 'mp4')).rejects.toThrow('cancel probe');
});

it('requires an explicit binding for active bookend video, while muted bookends remain silence', async () => {
  const args = request({ bookends: true });
  args.main.track = null;
  args.bookends.intro = { track, muted: true, gain: 1 };
  args.bookends.outro = { track, muted: false, gain: 0 };
  expect((await collect(args)).left.every((value) => value === 0)).toBe(true);
  expect(mock.render).not.toHaveBeenCalled();
  delete args.bookends.intro;
  await expect(collect(args)).rejects.toThrow('Missing presentation audio binding.');
});
