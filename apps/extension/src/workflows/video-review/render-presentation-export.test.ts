import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { writeReviewPresentationFrames } from './render-presentation-export';
import type { writeReviewFrames } from './render-export';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createNewWorkspacePresentationSettings } from '../../features/video/review/advanced/presentation';
import { planPresentationPreview } from '../../features/video/review/presentation-preview';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { parseReviewProvenance } from '../../features/video/review/provenance';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

const io = vi.hoisted(() => ({
  open: vi.fn(),
  render: vi.fn(),
  release: vi.fn(),
  rendererDispose: vi.fn(),
  probe: vi.fn(),
  encoder: vi.fn(),
  audioAdd: vi.fn(),
  audioFinish: vi.fn(),
  audioDispose: vi.fn(),
  audioReturn: vi.fn(),
  media: vi.fn(),
  videoAdd: vi.fn(),
  videoClose: vi.fn(),
  start: vi.fn(),
  finalize: vi.fn(),
  cancel: vi.fn(),
  supported: vi.fn(),
  events: [] as string[],
  samples: [] as { timestamp: number; duration: number; close: ReturnType<typeof vi.fn> }[],
  audioClones: [] as { timestamp: number; close: ReturnType<typeof vi.fn> }[],
  audioSamples: [] as {
    timestamp: number;
    numberOfFrames: number;
    sampleRate: number;
    close: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('mediabunny', async (original) => ({
  ...(await original<typeof import('mediabunny')>()),
  VideoSample: class {
    timestamp: number;
    duration: number;
    close = vi.fn();
    constructor(_source: unknown, options: { timestamp: number; duration: number }) {
      this.timestamp = options.timestamp;
      this.duration = options.duration;
      io.samples.push(this);
    }
  },
}));
vi.mock('./media-index', async (original) => ({
  ...(await original<typeof import('./media-index')>()),
  supportedReviewVideoCodecs: io.supported,
}));
vi.mock('./presentation-render', () => ({ createReviewPresentationRenderer: io.open }));
vi.mock('./presentation-audio', () => ({
  probePresentationAudio: io.probe,
  async *renderPresentationAudio(args: {
    plan: { segments: { audioEnd: number }[] };
    window?: { start: number; end: number };
  }) {
    try {
      const end = args.window?.end ?? args.plan.segments.at(-1)!.audioEnd;
      for (let start = args.window?.start ?? 0; start < end; start += 48000) {
        const sample = {
          timestamp: start / 48000,
          numberOfFrames: Math.min(48000, end - start),
          sampleRate: 48000,
          close: vi.fn(),
          clone() {
            const cloned = {
              ...sample,
              close: vi.fn(),
              setTimestamp(value: number) {
                cloned.timestamp = value;
              },
            };
            io.audioClones.push(cloned);
            return cloned;
          },
        };
        io.audioSamples.push(sample);
        try {
          yield sample;
        } finally {
          sample.close();
        }
      }
    } finally {
      io.audioReturn();
    }
  },
}));
vi.mock('./processed-audio-encoder', () => ({ createPresentationAudioEncoder: io.encoder }));
vi.mock('./media-output', () => ({ createReviewMediaOutput: io.media }));

type Args = Parameters<typeof writeReviewFrames>[0];
function fixture(): Args {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const settings = createNewWorkspacePresentationSettings();
  settings.intro = {
    mode: 'image',
    image: {
      assetId: 'intro-private',
      width: 100,
      height: 100,
      duration: 0.5,
      fit: 'contain',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  settings.outro = {
    mode: 'video',
    video: {
      assetId: 'outro-private',
      source: { width: 100, height: 100, duration: 2, size: 100, mimeType: 'video/mp4' },
      trim: { start: 1, end: 1.5 },
      audio: { muted: false, gain: 0.75 },
      fit: 'cover',
      fillColor: '#000000ff',
      crop: { panX: 0, panY: 0 },
    },
  };
  advanced.presentation = settings;
  return {
    file: new Blob(['video']),
    index: {
      duration: 2.105,
      width: 320,
      height: 180,
      boundaries: [0, 2.105],
      videoCodec: 'avc',
      audioCodec: null,
      container: 'mp4',
      rotation: 0,
      frameRate: 30,
      processedVideoCodec: 'avc',
      outputCodecs: { mp4: ['avc'], webm: ['vp9'] },
    },
    edits: [],
    advanced,
    fragmentOffset: 0,
    writer: { writeAt: vi.fn(async () => undefined) },
    signal: new AbortController().signal,
    readProjectAsset: async () => null,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.events.length = io.samples.length = io.audioSamples.length = io.audioClones.length = 0;
  io.supported.mockResolvedValue(['avc', 'vp9']);
  io.render.mockImplementation(async () => ({
    canvas: {} as HTMLCanvasElement,
    context: {} as CanvasRenderingContext2D,
    release: io.release,
  }));
  io.rendererDispose.mockImplementation(() => {
    io.events.push('renderer-dispose');
  });
  io.open.mockImplementation(async () => ({
    render: io.render,
    dispose: io.rendererDispose,
    audioTracks: { main: null, intro: null, outro: null },
  }));
  io.probe.mockResolvedValue({ audible: false, multichannel: false, codec: null });
  io.audioAdd.mockImplementation(async (sample: { timestamp: number }) => {
    io.events.push(`audio:${sample.timestamp}`);
  });
  io.audioFinish.mockImplementation(async () => {
    io.events.push('audio-finish');
  });
  io.audioDispose.mockImplementation(() => {
    io.events.push('encoder-dispose');
  });
  io.audioReturn.mockImplementation(() => {
    io.events.push('audio-return');
  });
  io.encoder.mockImplementation((args: { frameCount: number }) => ({
    source: {},
    window: { kind: 'aac-mp4', sampleRate: 48000, frameCount: args.frameCount },
    add: io.audioAdd,
    finish: io.audioFinish,
    dispose: io.audioDispose,
  }));
  io.videoAdd.mockImplementation(async (sample: { timestamp: number }) => {
    io.events.push(`video:${sample.timestamp}`);
  });
  io.videoClose.mockImplementation(() => {
    io.events.push('video-close');
  });
  io.start.mockImplementation(async () => {
    io.events.push('start');
  });
  io.finalize.mockImplementation(async () => {
    io.events.push('finalize');
  });
  io.cancel.mockImplementation(async () => {
    io.events.push('cancel');
  });
  io.media.mockImplementation(() => ({
    output: { start: io.start, finalize: io.finalize, cancel: io.cancel },
    video: { kind: 'sample', source: { add: io.videoAdd, close: io.videoClose } },
    audio: null,
  }));
});
afterEach(() => vi.restoreAllMocks());

it('renders the complete rational sequence with explicit geometry and a partial final video sample', async () => {
  const args = fixture();
  args.captionTimeMap = buildReviewTimeMap(args.index.duration, []);
  args.index.frameRate = 30000 / 1001;
  const result = await writeReviewPresentationFrames(args);
  expect(result.resultDuration).toBe(3.105);
  expect(result.videoPackets).toBe(io.samples.length);
  expect(io.samples.at(-1)!.timestamp + io.samples.at(-1)!.duration).toBeCloseTo(3.105, 12);
  expect(io.open).toHaveBeenCalledWith(
    expect.objectContaining({
      plan: expect.objectContaining({ rate: { numerator: 30000, denominator: 1001 } }),
      main: expect.objectContaining({
        captionTimeMap: args.captionTimeMap,
        dimensions: {
          canonical: { width: 320, height: 180 },
          backing: { width: 320, height: 180 },
        },
      }),
    })
  );
  expect(io.media).toHaveBeenCalledWith(
    expect.objectContaining({
      omitAudio: true,
      sampleVideo: expect.objectContaining({ preserveFrameTiming: true }),
    })
  );
  expect(result.outputAudioCodec).toBeNull();
  expect(result.audioReencoded).toBe(false);
  expect(io.encoder).not.toHaveBeenCalled();
  expect(io.finalize).toHaveBeenCalledOnce();
  expect(io.release).toHaveBeenCalledTimes(io.samples.length);
  expect(io.samples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
});

it('uses actual bookend audio despite a silent primary index and interleaves bounded PCM with video', async () => {
  const args = fixture();
  const primary = { codec: 'aac' },
    outro = { codec: 'opus' };
  io.open.mockResolvedValue({
    render: io.render,
    dispose: io.rendererDispose,
    audioTracks: { main: primary, intro: null, outro },
  });
  io.probe.mockResolvedValue({ audible: true, multichannel: true, codec: 'aac' });
  const result = await writeReviewPresentationFrames(args);
  expect(io.probe).toHaveBeenCalledWith(
    expect.objectContaining({
      main: expect.objectContaining({ track: primary }),
      bookends: { outro: { track: outro, muted: false, gain: 0.75 } },
    }),
    'mp4'
  );
  expect(io.encoder).toHaveBeenCalledWith(
    expect.objectContaining({ codec: 'aac', frameCount: 149040 })
  );
  expect(io.media.mock.calls[0]![0].presentationAudio.window.frameCount).toBe(149040);
  const firstAudio = io.events.indexOf('audio:0'),
    firstVideo = io.events.indexOf('video:0'),
    secondAudio = io.events.indexOf('audio:1');
  expect(firstAudio).toBeLessThan(firstVideo);
  expect(firstVideo).toBeLessThan(secondAudio);
  expect(
    io.audioSamples.every(
      (sample) => sample.numberOfFrames <= 48000 && sample.close.mock.calls.length === 1
    )
  ).toBe(true);
  expect(result.audioReencoded).toBe(true);
  expect(result.outputAudioCodec).toBe('aac');
  expect(io.events.indexOf('audio-finish')).toBeLessThan(io.events.indexOf('finalize'));
});

it('does not let encoded packet padding change T and projects supplied base provenance to v2', async () => {
  const args = fixture();
  io.probe.mockResolvedValue({ audible: true, multichannel: false, codec: 'aac' });
  args.provenance = JSON.stringify({
    format: 'sniptale.video-edit.v1',
    timeUnit: 'seconds',
    source: {
      width: 320,
      height: 180,
      duration: 2.105,
      size: args.file.size,
      mimeType: 'video/mp4',
      filename: 'source.mp4',
    },
    revision: 1,
    exportedAt: 1,
    edits: [],
    audioReencoded: false,
  });
  io.audioFinish.mockImplementation(async () => {
    const callback = io.encoder.mock.calls[0]![0].onPacket;
    callback({ timestamp: 100, duration: 5 });
  });
  const result = await writeReviewPresentationFrames(args);
  expect(result.resultDuration).toBe(3.105);
  expect(result.audioPackets).toBe(1);
  const encoded = io.media.mock.calls[0]![0].provenance;
  expect(encoded).not.toContain('intro-private');
  expect(encoded).not.toContain('outro-private');
  expect(parseReviewProvenance(encoded)).toMatchObject({
    format: 'sniptale.video-edit.v2',
    audioReencoded: true,
    presentation: { baked: true, totalDurationUs: 3105000, includeBookends: true },
  });
});

it('frame-probes the full sequence clock without audio, encoder, muxer or positioned writes', async () => {
  const args = fixture();
  args.index.duration = 100;
  args.index.boundaries = [0, 100];
  const add = vi.fn(async () => undefined);
  args.frameProbe = { add };
  const result = await writeReviewPresentationFrames(args);
  expect(result.resultDuration).toBe(101);
  expect(result.videoPackets).toBeLessThan(3030);
  expect(add).toHaveBeenCalled();
  expect(io.probe).not.toHaveBeenCalled();
  expect(io.encoder).not.toHaveBeenCalled();
  expect(io.media).not.toHaveBeenCalled();
  expect(args.writer.writeAt).not.toHaveBeenCalled();
  expect(io.samples.some((sample) => sample.timestamp > 90)).toBe(true);
});

it('omits fragment bookends and visual/audio fades while retaining main clocks', async () => {
  const args = fixture();
  args.includeBookends = false;
  args.fragmentOffset = 4;
  const result = await writeReviewPresentationFrames(args);
  expect(result.resultDuration).toBe(2.105);
  const plan = io.open.mock.calls[0]![0].plan;
  expect(plan.segments).toHaveLength(1);
  expect(plan.segments[0].content.fragmentOffset).toBe(4);
  expect(plan.visualEnvelope).toMatchObject({ fadeIn: 0, fadeOut: 0 });
  expect(plan.audioEnvelope).toMatchObject({ fadeIn: 0, fadeOut: 0 });
});

it('rejects audible media without an admitted output codec before muxing', async () => {
  io.probe.mockResolvedValue({ audible: true, multichannel: false, codec: null });
  await expect(writeReviewPresentationFrames(fixture())).rejects.toMatchObject({
    reasons: ['audio-encoder'],
  });
  expect(io.media).not.toHaveBeenCalled();
  expect(io.rendererDispose).toHaveBeenCalledOnce();
});

it.each(['audio', 'video', 'finalize'] as const)(
  'cleans encoder, output and renderer after %s failure',
  async (stage) => {
    io.probe.mockResolvedValue({ audible: true, multichannel: false, codec: 'aac' });
    if (stage === 'audio') io.audioAdd.mockRejectedValueOnce(new Error('Audio failed'));
    if (stage === 'video') io.videoAdd.mockRejectedValueOnce(new Error('Video failed'));
    if (stage === 'finalize') io.finalize.mockRejectedValueOnce(new Error('Finalize failed'));
    await expect(writeReviewPresentationFrames(fixture())).rejects.toThrow('failed');
    expect(io.events.indexOf('encoder-dispose')).toBeLessThan(io.events.indexOf('cancel'));
    expect(io.events.indexOf('cancel')).toBeLessThan(io.events.indexOf('renderer-dispose'));
    expect(io.audioDispose).toHaveBeenCalledOnce();
    expect(io.rendererDispose).toHaveBeenCalledOnce();
    expect(io.audioSamples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
  }
);

it('stops video submission when cancellation occurs during bounded audio encoding', async () => {
  const args = fixture();
  const controller = new AbortController();
  args.signal = controller.signal;
  io.probe.mockResolvedValue({ audible: true, multichannel: false, codec: 'aac' });
  io.audioAdd.mockImplementation(async () => {
    controller.abort();
  });
  await expect(writeReviewPresentationFrames(args)).rejects.toMatchObject({ name: 'AbortError' });
  expect(io.videoAdd).not.toHaveBeenCalled();
  expect(io.cancel).toHaveBeenCalledOnce();
  expect(io.audioSamples[0]!.close).toHaveBeenCalledOnce();
  expect(io.release).toHaveBeenCalledOnce();
});

it('refuses missing native video capability and malformed provenance', async () => {
  io.supported.mockResolvedValueOnce([]);
  await expect(writeReviewPresentationFrames(fixture())).rejects.toMatchObject({
    reasons: ['video-encoder'],
  });
  expect(io.open).not.toHaveBeenCalled();
  const args = fixture();
  args.provenance = 'untrusted';
  await expect(writeReviewPresentationFrames(args)).rejects.toThrow('provenance');
  expect(io.rendererDispose).toHaveBeenCalledOnce();
});

function endingPreview(args: Args) {
  const planned = planReviewPresentationSequence({
    settings: args.advanced.presentation!,
    mainDuration: args.index.duration,
    fragmentOffset: args.fragmentOffset,
    includeBookends: true,
    rate: { numerator: args.index.frameRate!, denominator: 1 },
  });
  if (!planned.ok) throw new Error('Expected sequence');
  const selection = planPresentationPreview({
    sequence: planned.plan,
    edge: 'ending',
    width: args.index.width!,
    height: args.index.height!,
    preferences: { frameRate: '24', rasterPreset: 'current' },
  });
  return {
    window: selection.windows.find((window) => window.name === 'end')!,
    backing: { width: selection.width, height: selection.height },
  };
}
it('renders a bounded late window with original mappings and rebased container audio/video', async () => {
  const args = fixture();
  args.index.duration = 3600;
  args.index.width = 1920;
  args.index.height = 1080;
  args.index.frameRate = 60;
  const preview = endingPreview(args);
  io.probe.mockResolvedValue({ audible: true, multichannel: false, codec: 'aac' });
  const receipt = await writeReviewPresentationFrames(args, preview);
  expect(receipt.resultDuration).toBe((preview.window.endUs - preview.window.startUs) / 1e6);
  expect(io.open.mock.calls[0]![0].dimensions).toBeUndefined();
  expect(io.open.mock.calls[0]![0].main.dimensions).toEqual({
    canonical: { width: 1920, height: 1080 },
    backing: { width: 640, height: 360 },
  });
  expect(io.probe.mock.calls[0]![0].window).toEqual({
    start: preview.window.audioStart,
    end: preview.window.audioEnd,
  });
  expect(io.encoder.mock.calls[0]![0].frameCount).toBe(
    preview.window.audioEnd - preview.window.audioStart
  );
  expect(io.samples[0]!.timestamp).toBe(0);
  expect(io.samples.length).toBeLessThanOrEqual(91);
  expect(io.samples.at(-1)!.timestamp + io.samples.at(-1)!.duration).toBeCloseTo(
    receipt.resultDuration,
    6
  );
  expect(io.render.mock.calls[0]![0].timestampUs).toBe(preview.window.startUs);
  expect(io.render.mock.calls.at(-1)![0].retainEndpoint).toBe(true);
  expect(io.audioSamples[0]!.timestamp).toBe(preview.window.audioStart / 48000);
  expect(io.audioClones[0]!.timestamp).toBe(0);
  expect(io.audioSamples.length).toBeLessThanOrEqual(3);
  expect(io.audioSamples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
  expect(io.audioClones.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
  expect(io.media.mock.calls[0]![0].sampleVideo.frameRate).toBe(30);
});
it('omits preview provenance and closes the borrowed and cloned audio on cancellation', async () => {
  const args = fixture();
  args.index.duration = 10;
  args.provenance = 'not-published-metadata';
  const controller = new AbortController();
  args.signal = controller.signal;
  io.probe.mockResolvedValue({ audible: true, multichannel: false, codec: 'aac' });
  io.audioAdd.mockImplementationOnce(async () => controller.abort());
  await expect(writeReviewPresentationFrames(args, endingPreview(args))).rejects.toThrow();
  expect(io.media.mock.calls[0]![0]).not.toHaveProperty('provenance');
  expect(io.audioClones[0]!.close).toHaveBeenCalledOnce();
  expect(io.audioSamples[0]!.close).toHaveBeenCalledOnce();
  expect(io.videoAdd).not.toHaveBeenCalled();
  expect(io.cancel).toHaveBeenCalledOnce();
  expect(io.rendererDispose).toHaveBeenCalledOnce();
});
it('rejects stale preview candidate geometry and oversized raster before opening resources', async () => {
  const args = fixture();
  const preview = endingPreview(args);
  await expect(
    writeReviewPresentationFrames(args, { ...preview, backing: { width: 641, height: 360 } })
  ).rejects.toThrow('Invalid');
  const frames = preview.window.frames.map((frame, index) =>
    index === 0 ? { ...frame, sequenceDurationUs: 1 } : frame
  );
  await expect(
    writeReviewPresentationFrames(args, { ...preview, window: { ...preview.window, frames } })
  ).rejects.toThrow('does not match');
  expect(io.open).not.toHaveBeenCalled();
});
