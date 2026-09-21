import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import { drawReviewSpotlight } from './render-spotlight';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReviewEdit } from '../../features/video/review/types';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createCanvasComment } from '../../features/video/review/comments';
import {
  drawReviewSceneFrame,
  drainSegmentAudio,
  renderRenderWindowFrames,
  reviewRenderFrameSchedule,
  writeReviewFrames,
} from './render-export';

vi.mock('./render-spotlight', () => ({ drawReviewSpotlight: vi.fn() }));

const state = vi.hoisted(() => ({
  configurations: [] as unknown[],
  encoded: [] as { timestamp: number; close: unknown; width: number; height: number }[],
  composited: [] as unknown[][],
  drawn: [] as { draw: unknown; close: unknown }[],
  audioTrack: null as null | {
    codec: 'opus';
    getDecoderConfig(): Promise<AudioDecoderConfig>;
    getSampleRate(): Promise<number>;
  },
}));

vi.mock('mediabunny', () => {
  class VideoSample {
    timestamp: number;
    width: number;
    height: number;
    close = vi.fn();
    draw = vi.fn();
    constructor(source: HTMLCanvasElement | null, init: { timestamp: number }) {
      this.timestamp = init.timestamp;
      this.width = source?.width ?? 0;
      this.height = source?.height ?? 0;
    }
  }
  class VideoSampleSink {
    async *samplesAtTimestamps(times: readonly number[]) {
      for (const time of times) {
        const sample = new VideoSample(null, { timestamp: time });
        state.drawn.push({ draw: sample.draw, close: sample.close });
        yield sample;
      }
    }
  }
  class Input {
    async getPrimaryVideoTrack() {
      return {
        codec: 'vp9',
        canDecode: async () => true,
        getDisplayWidth: async () => 320,
        getDisplayHeight: async () => 180,
      };
    }
    async getPrimaryAudioTrack() {
      return state.audioTrack;
    }
    dispose(): void {}
  }
  class Output {
    start = vi.fn();
    finalize = vi.fn();
    cancel = vi.fn(async () => undefined);
    addVideoTrack = vi.fn();
    addAudioTrack = vi.fn();
    setMetadataTags = vi.fn();
  }
  class VideoSampleSource {
    constructor(config: unknown) {
      state.configurations.push(config);
    }
    add = vi.fn(async (sample: VideoSample) => {
      state.encoded.push({
        timestamp: sample.timestamp,
        close: sample.close,
        width: sample.width,
        height: sample.height,
      });
    });
    close(): void {}
  }
  return {
    ALL_FORMATS: [],
    BlobSource: class {},
    Input,
    Output,
    StreamTarget: class {},
    Mp4OutputFormat: class {},
    WebMOutputFormat: class {},
    VideoSample,
    VideoSampleSink,
    VideoSampleSource,
    EncodedVideoPacketSource: class {},
    EncodedAudioPacketSource: class {},
    AudioSampleSource: class {},
    EncodedPacketSink: class {},
  };
});

const realDocument = globalThis.document;
const realVideoEncoder = globalThis.VideoEncoder;
const realCreateImageBitmap = globalThis.createImageBitmap;

function contextFixture() {
  return {
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textBaseline: '',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    drawImage: vi.fn((...args: unknown[]) => state.composited.push(args)),
  } as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  globalThis.VideoEncoder = {
    isConfigSupported: async (config: VideoEncoderConfig) => ({ config, supported: true }),
  } as unknown as typeof VideoEncoder;
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contextFixture() }),
  } as unknown as Document;
  globalThis.createImageBitmap = (async () => {
    throw new Error('decode failed');
  }) as typeof createImageBitmap;
});

afterAll(() => {
  globalThis.document = realDocument;
  globalThis.VideoEncoder = realVideoEncoder;
  globalThis.createImageBitmap = realCreateImageBitmap;
});

function writerFixture() {
  return { writeAt: vi.fn(async () => undefined) };
}

function argsFixture(overrides?: {
  advanced?: ReturnType<typeof createQuickEditAdvancedState>;
  processedVideoCodec?: 'avc' | 'vp8' | 'vp9' | null;
  audioCodec?: 'aac' | 'opus' | null;
  frameRate?: number;
}) {
  const advanced = overrides?.advanced ?? createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  return {
    file: new Blob(['video']),
    index: {
      duration: 2,
      boundaries: [0, 2],
      videoCodec: 'vp9' as const,
      audioCodec: overrides?.audioCodec ?? null,
      container: 'webm' as const,
      rotation: 0 as const,
      processedVideoCodec:
        overrides && overrides.processedVideoCodec !== undefined
          ? overrides.processedVideoCodec
          : ('vp9' as const),
      frameRate: overrides?.frameRate ?? 2,
    },
    edits: [] as ReviewEdit[],
    advanced,
    fragmentOffset: 0,
    writer: writerFixture(),
    signal: new AbortController().signal,
    readProjectAsset: vi.fn(async (): Promise<Blob | null> => null),
  };
}

function segmentStub(sourceStart: number, sourceEnd: number) {
  return {
    sourceStart,
    sourceEnd,
    resultStart: sourceStart,
    resultEnd: sourceEnd,
    kind: 'keep' as const,
    rate: 1,
  };
}

function cutEdit(start: number, end: number) {
  return {
    id: `cut-${start}`,
    kind: 'cut' as const,
    start,
    end,
    requestedStart: start,
    requestedEnd: end,
  };
}

function speedEdit(start: number, end: number) {
  return {
    id: `speed-${start}`,
    kind: 'speed' as const,
    start,
    end,
    requestedStart: start,
    requestedEnd: end,
    rate: 0.5 as const,
    audio: 'speed' as const,
  };
}

describe('reviewRenderFrameSchedule', () => {
  it('covers an unedited duration exactly on the fps lattice', () => {
    const windows = reviewRenderFrameSchedule(2.5, [], 10);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.timestamps).toHaveLength(25);
    expect(windows[0]!.timestamps[0]).toBe(0);
    expect(windows[0]!.timestamps.at(-1)).toBe(2.4);
    expect(windows[0]!.sourceTimes[0]).toBe(0);
    expect(windows[0]!.sourceTimes.at(-1)).toBeCloseTo(2.4, 9);
  });

  it('shifts timestamps across cuts and resamples speed segments', () => {
    const windows = reviewRenderFrameSchedule(10, [cutEdit(1, 3), speedEdit(5, 7)], 2);
    expect(windows).toHaveLength(4);
    expect(windows[0]!.segment).toMatchObject({ sourceStart: 0, sourceEnd: 1, resultStart: 0 });
    expect(windows[1]!.segment).toMatchObject({ sourceStart: 3, sourceEnd: 5, resultStart: 1 });
    expect(windows[2]!.segment).toMatchObject({
      sourceStart: 5,
      sourceEnd: 7,
      resultStart: 3,
      rate: 0.5,
    });
    expect(windows[3]!.segment).toMatchObject({ sourceStart: 7, sourceEnd: 10, resultStart: 7 });
    expect(windows[2]!.timestamps).toHaveLength(8);
    expect(windows[2]!.timestamps[0]).toBe(3);
    expect(windows[2]!.sourceTimes[2]).toBeCloseTo(5.5, 9);
  });

  it('keeps frames over a sub-frame tail and rejects invalid frame rates', () => {
    const windows = reviewRenderFrameSchedule(0.1, [], 30);
    expect(windows[0]!.timestamps).toHaveLength(3);
    expect(() => reviewRenderFrameSchedule(1, [], 0)).toThrow('Render frame rate is invalid.');
  });
});

describe('drawReviewSceneFrame', () => {
  const layout = {
    contentRect: { x: 8, y: 8, width: 160, height: 88 },
    videoRect: { x: 8, y: 8, width: 160, height: 88 },
    videoTransform: { x: 4, y: 2, width: 168, height: 104 },
  };

  it('paints the background, clips the content rect, and draws the camera-transformed frame', () => {
    const context = contextFixture();
    const draw = vi.fn();
    drawReviewSceneFrame(context, {
      canvas: { width: 176, height: 104 },
      layout,
      background: {
        enabled: true,
        type: 'solid',
        color: '#123456ff',
        layout: { padding: 8, cornerRadius: 0 },
      },
      image: null,
      sample: { draw } as never,
    });
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 176, 104);
    expect(context.beginPath).toHaveBeenCalled();
    expect(context.rect).toHaveBeenCalledWith(8, 8, 160, 88);
    expect(context.clip).toHaveBeenCalled();
    expect(draw).toHaveBeenCalledWith(context, 4, 2, 168, 104);
    expect(context.restore).toHaveBeenCalled();
  });

  it('clips with the rounded content rect when a corner radius is set', () => {
    const context = contextFixture();
    const draw = vi.fn();
    drawReviewSceneFrame(context, {
      canvas: { width: 176, height: 104 },
      layout,
      background: {
        enabled: true,
        type: 'solid',
        color: '#000000ff',
        layout: { padding: 8, cornerRadius: 24 },
      },
      image: null,
      sample: { draw } as never,
    });
    expect(context.roundRect).toHaveBeenCalledWith(8, 8, 160, 88, 24);
    expect(context.rect).not.toHaveBeenCalled();
  });

  it('draws a contained image background under the unclipped full-frame video', () => {
    const context = contextFixture();
    const draw = vi.fn();
    const image = { width: 40, height: 40 } as ImageBitmap;
    drawReviewSceneFrame(context, {
      canvas: { width: 160, height: 90 },
      layout: {
        ...layout,
        contentRect: { x: 0, y: 0, width: 160, height: 90 },
        videoTransform: { x: 0, y: 0, width: 160, height: 90 },
      },
      background: {
        enabled: true,
        type: 'image',
        assetId: 'asset:pic',
        imageFit: 'contain',
        layout: { padding: 0, cornerRadius: 0 },
      },
      image,
      sample: { draw } as never,
    });
    expect(context.drawImage).toHaveBeenCalledWith(image, 35, 0, 90, 90);
    expect(context.clip).toHaveBeenCalled();
    expect(draw).toHaveBeenCalledWith(context, 0, 0, 160, 90);
  });
});

describe('renderRenderWindowFrames', () => {
  it('draws and encodes every scheduled frame at its output timestamp', async () => {
    const videoOut = { add: vi.fn(async () => undefined), close: vi.fn() };
    const onProgress = vi.fn();
    const frameSink = {
      samplesAtTimestamps: async function* (times: readonly number[]) {
        for (const _time of times) yield { draw: vi.fn(), close: vi.fn() } as never;
      },
    };
    await renderRenderWindowFrames({
      window: { segment: segmentStub(0, 1), timestamps: [0, 0.5], sourceTimes: [0, 0.5] },
      fps: 2,
      fragmentOffset: 1,
      zoomRegions: [
        {
          id: 'z',
          start: 1,
          end: 2,
          transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
          enter: { type: 'none', duration: 0 },
          exit: { type: 'none', duration: 0 },
        },
      ],
      background: { enabled: false },
      comments: [],
      canvas: { width: 320, height: 180 } as HTMLCanvasElement,
      sourceSize: { width: 320, height: 180 },
      context: contextFixture(),
      image: null,
      frameSink: frameSink as never,
      videoOut,
      resultDuration: 1,
      onProgress,
      signal: new AbortController().signal,
    });
    expect(videoOut.add).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('fails loudly when a source frame is missing', async () => {
    const frameSink = {
      samplesAtTimestamps: async function* () {
        yield null;
      },
    };
    await expect(
      renderRenderWindowFrames({
        window: { segment: segmentStub(0, 1), timestamps: [0], sourceTimes: [0] },
        fps: 2,
        fragmentOffset: 0,
        zoomRegions: [],
        background: { enabled: false },
        comments: [],
        canvas: { width: 320, height: 180 } as HTMLCanvasElement,
        sourceSize: { width: 320, height: 180 },
        context: contextFixture(),
        image: null,
        frameSink: frameSink as never,
        videoOut: { add: vi.fn(), close: vi.fn() },
        resultDuration: 1,
        onProgress: undefined,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('Source frame is unavailable.');
  });
});

describe('drainSegmentAudio', () => {
  it('fails when processed audio has no audio output track', async () => {
    await expect(
      drainSegmentAudio({
        segment: segmentStub(0, 1),
        track: null,
        sink: null,
        audioOut: null,
        processedAudio: 'opus',
        audioConfig: null,
        muted: false,
        exportAudio: undefined,
        sampleRate: 48_000,
        audioCodec: null,
        clock: { time: 0 },
        receipt: {
          videoPackets: 0,
          audioPackets: 0,
          resultDuration: 1,
          audioRanges: [],
        },
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('Audio output configuration changed.');
  });
});

describe('writeReviewFrames', () => {
  afterEach(() => {
    state.encoded.length = 0;
    state.drawn.length = 0;
    state.audioTrack = null;
  });

  it('blocks the render without a probed video encoder', async () => {
    await expect(
      writeReviewFrames(argsFixture({ processedVideoCodec: null }))
    ).rejects.toMatchObject({ name: 'QuickEditExportUnavailable', reasons: ['video-encoder'] });
  });

  it('blocks invalid edit ranges before staging', async () => {
    const args = argsFixture();
    args.edits = [cutEdit(-0.5, 1.5)] as ReviewEdit[];
    await expect(writeReviewFrames(args)).rejects.toThrow(
      'Export requires valid non-overlapping edit ranges.'
    );
  });

  it('renders every scheduled frame through the scene draw and encodes the output', async () => {
    const args = argsFixture({ frameRate: 2 });
    const receipt = await writeReviewFrames(args);
    expect(args.readProjectAsset).not.toHaveBeenCalled();
    expect(receipt).toMatchObject({
      videoPackets: 4,
      audioPackets: 0,
      resultDuration: 2,
      audioReencoded: false,
      outputAudioCodec: null,
    });
    expect(state.encoded.map((sample) => sample.timestamp)).toEqual([0, 0.5, 1, 1.5]);
    expect(
      state.encoded.every(
        (sample) => (sample.close as ReturnType<typeof vi.fn>).mock.calls.length === 1
      )
    ).toBe(true);
    expect(
      state.drawn.every(
        (sample) => (sample.close as ReturnType<typeof vi.fn>).mock.calls.length === 1
      )
    ).toBe(true);
    expect(
      state.drawn.every(
        (sample) => (sample.draw as ReturnType<typeof vi.fn>).mock.calls.length === 1
      )
    ).toBe(true);
  });

  it('loads a missing image background as a typed unavailable export', async () => {
    const args = argsFixture();
    args.advanced.background = {
      enabled: true,
      type: 'image',
      assetId: 'asset:pic',
      imageFit: 'cover',
      layout: { padding: 0, cornerRadius: 0 },
    };
    await expect(writeReviewFrames(args)).rejects.toMatchObject({
      name: 'QuickEditExportUnavailable',
      reasons: ['asset-missing'],
    });
  });
});

describe('writeReviewFrames background lifecycle', () => {
  afterEach(() => {
    state.encoded.length = 0;
    state.drawn.length = 0;
    state.audioTrack = null;
  });

  it('closes a decoded background image after a successful render', async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap)
    );
    const args = argsFixture();
    args.advanced.background = {
      enabled: true,
      type: 'image',
      assetId: 'project-asset:pic',
      imageFit: 'cover',
      layout: { padding: 0, cornerRadius: 0 },
    };
    args.readProjectAsset.mockResolvedValue(new Blob(['image']));
    await writeReviewFrames(args);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('closes a decoded background image when rendering throws', async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap)
    );
    const args = argsFixture();
    args.advanced.background = {
      enabled: true,
      type: 'image',
      assetId: 'project-asset:pic',
      imageFit: 'cover',
      layout: { padding: 0, cornerRadius: 0 },
    };
    args.readProjectAsset.mockResolvedValue(new Blob(['image']));
    await expect(
      writeReviewFrames({
        ...args,
        onProgress: () => {
          throw new Error('progress failed');
        },
      })
    ).rejects.toThrow('progress failed');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('closes a decoded background image when source acquisition later fails', async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap)
    );
    state.audioTrack = {
      codec: 'opus',
      getDecoderConfig: async () => ({
        codec: 'opus',
        sampleRate: 48_000,
        numberOfChannels: 2,
      }),
      getSampleRate: async () => {
        throw new Error('sample rate failed');
      },
    };
    const args = argsFixture({ audioCodec: 'opus' });
    args.advanced.background = {
      enabled: true,
      type: 'image',
      assetId: 'project-asset:pic',
      imageFit: 'cover',
      layout: { padding: 0, cornerRadius: 0 },
    };
    args.readProjectAsset.mockResolvedValue(new Blob(['image']));
    await expect(writeReviewFrames(args)).rejects.toThrow('sample rate failed');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});

it('burns visible comments inside the clip and viewport comments after restore', async () => {
  const calls: string[] = [];
  const context = {
    ...contextFixture(),
    save: vi.fn(() => calls.push('save')),
    clip: vi.fn(() => calls.push('clip')),
    restore: vi.fn(() => calls.push('restore')),
    arc: vi.fn(() => calls.push('point')),
    fillText: vi.fn(() => calls.push('text')),
    roundRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const frameSink = {
    samplesAtTimestamps: async function* (times: readonly number[]) {
      for (const _time of times) yield { draw: vi.fn(), close: vi.fn() } as never;
    },
  };
  const videoOut = { add: vi.fn(async () => undefined), close: vi.fn() };
  await renderRenderWindowFrames({
    window: { segment: segmentStub(0, 1), timestamps: [0], sourceTimes: [0.5] },
    fps: 2,
    fragmentOffset: 0,
    zoomRegions: [],
    background: { enabled: false },
    comments: [
      { ...createCanvasComment({ id: 'in', at: 0 }), resolvedText: 'burn me' },
      { ...createCanvasComment({ id: 'out', at: 0.9 }), resolvedText: 'too late' },
      {
        ...createCanvasComment({ id: 'flat', at: 0 }),
        renderToVideo: false,
        resolvedText: 'never',
      },
    ] as never,
    canvas: { width: 320, height: 180 } as HTMLCanvasElement,
    sourceSize: { width: 320, height: 180 },
    context,
    image: null,
    frameSink: frameSink as never,
    videoOut,
    resultDuration: 1,
    onProgress: undefined,
    signal: new AbortController().signal,
  });
  expect(calls.filter((call) => call === 'point')).toHaveLength(2);
  expect(calls.filter((call) => call === 'text')).toHaveLength(1);
  expect(calls.indexOf('clip')).toBeLessThan(calls.indexOf('point'));
});

it('uses the selected render frame rate and rejects an unprobed codec', async () => {
  const args = argsFixture();
  state.encoded.length = 0;
  await writeReviewFrames({ ...args, renderSettings: { quality: 'MEDIUM', frameRate: 24 } });
  expect(state.encoded).toHaveLength(48);
  expect(state.encoded[1]!.timestamp).toBeCloseTo(1 / 24);
  await expect(
    writeReviewFrames({ ...args, renderSettings: { quality: 'HIGH', frameRate: 30, codec: 'avc' } })
  ).rejects.toMatchObject({ name: 'QuickEditExportUnavailable' });
});

it('encodes the selected portrait canvas while fitting the native landscape source', async () => {
  state.encoded.length = 0;
  state.drawn.length = 0;
  const advanced = createQuickEditAdvancedState();
  advanced.canvas = { width: 1080, height: 1920 };
  await writeReviewFrames(argsFixture({ advanced }));
  expect(state.encoded.length).toBeGreaterThan(0);
  expect(state.encoded.every((frame) => frame.width === 1080 && frame.height === 1920)).toBe(true);
  expect(state.composited).toContainEqual([
    expect.objectContaining({ width: 320, height: 180 }),
    0,
    656.25,
    1080,
    607.5,
  ]);
});

it('renders exact non-keyframe cuts while keeping output timestamps continuous', async () => {
  state.encoded.length = 0;
  const args = argsFixture();
  args.edits = [cutEdit(0, 0.25), cutEdit(1.75, 2)];
  const receipt = await writeReviewFrames(args);
  expect(receipt.resultDuration).toBeCloseTo(1.5);
  expect(state.encoded.map((sample) => sample.timestamp)).toEqual([0, 0.5, 1]);
});

it('isolates the visible source pixels before filtering a scaled composition', async () => {
  state.drawn.length = 0;
  const args = argsFixture();
  args.advanced.canvas = { width: 1920, height: 1080 };
  await writeReviewFrames(args);
  expect(state.drawn[0]!.draw).toHaveBeenCalledWith(
    expect.objectContaining({ imageSmoothingEnabled: false }),
    0,
    0,
    320,
    180
  );
});

it('passes the calibrated variable-rate quality profile to the actual encoder source', async () => {
  const args = argsFixture({ frameRate: 30 });
  args.advanced.canvas = { width: 1920, height: 1080 };
  await writeReviewFrames({
    ...args,
    renderSettings: { quality: 'HIGH', frameRate: 30, resolution: '720P' },
  });
  expect(state.configurations.at(-1)).toMatchObject({
    codec: 'vp9',
    bitrate: 5_000_000,
    bitrateMode: 'variable',
    latencyMode: 'quality',
    hardwareAcceleration: 'no-preference',
  });
  expect(state.encoded.at(-1)).toMatchObject({ width: 1280, height: 720 });
});

it('scales spotlight blur with export resolution, preserving the scene effect', async () => {
  const args = argsFixture({ frameRate: 30 });
  args.advanced.canvas = { width: 1920, height: 1080 };
  args.advanced.zoom.enabled = true;
  args.advanced.ui.tracks.zoom = true;
  const region = createQuickEditZoomRegion({ id: 'spot', at: 0, duration: 2, endMax: 2 });
  region.spotlight = { ...createQuickEditSpotlight(), effect: 'blur', blur: 12 };
  region.enter = { type: 'none', duration: 0 };
  region.exit = { type: 'none', duration: 0 };
  args.advanced.zoom.regions = [region];
  await writeReviewFrames({
    ...args,
    renderSettings: { quality: 'HIGH', frameRate: 30, resolution: '720P' },
  });
  expect(drawReviewSpotlight).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    expect.objectContaining({ blur: 8 })
  );
});
