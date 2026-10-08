import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
import { drawReviewSceneFrame } from './scene-frame';
import { state, contextFixture, argsFixture } from './render-export.test-support';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import { drawReviewSpotlights } from './render-spotlight';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewEdit } from '../../features/video/review/types';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createCanvasComment } from '../../features/video/review/comments';
import { drainSegmentAudio, renderRenderWindowFrames, writeReviewFrames } from './render-export';
import { createNewWorkspacePresentationSettings } from '../../features/video/review/advanced/presentation';
const presentationExport = vi.hoisted(() => vi.fn());
vi.mock('./render-presentation-export', () => ({
  writeReviewPresentationFrames: presentationExport,
}));

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

it('shares the rational Current rate with the output profile', async () => {
  const args = argsFixture({ frameRate: 30000 / 1001 + 1e-10 });
  const { resolveReviewOutputProfile } = await import('./render-settings');
  const profile = resolveReviewOutputProfile(args.index, args.advanced);
  state.encoded.length = 0;
  await writeReviewFrames(args);
  expect(state.encoded[1]!.timestamp).toBe(1 / profile.fps);
});

it.each([NaN, Infinity, 0, 121])(
  'rejects an invalid Current rate before decoding: %s',
  async (frameRate) => {
    state.drawn.length = 0;
    await expect(writeReviewFrames(argsFixture({ frameRate }))).rejects.toThrow(
      'Invalid output frame rate.'
    );
    expect(state.drawn).toHaveLength(0);
  }
);

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

it('passes constant quality with the calibrated VBR fallback to the actual encoder source', async () => {
  const args = argsFixture({ frameRate: 30 });
  args.advanced.canvas = { width: 1920, height: 1080 };
  await writeReviewFrames({
    ...args,
    renderSettings: { quality: 'HIGH', frameRate: 30, resolution: '720P' },
  });
  expect(state.configurations.at(-1)).toMatchObject({
    codec: 'vp9',
    quality: expect.objectContaining({ _quantizer: 24, _bitrate: 5_000_000 }),
    bitrateMode: 'variable',
    latencyMode: 'quality',
    hardwareAcceleration: 'no-preference',
  });
  expect(state.encoded.at(-1)).toMatchObject({ width: 1280, height: 720 });
});

it('scales spotlight blur with export resolution, preserving the scene effect', async () => {
  vi.mocked(drawReviewSpotlights).mockClear();
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
  const frames = vi.mocked(drawReviewSpotlights).mock.calls.flatMap((call) => call[3]);
  expect(frames.length).toBeGreaterThan(0);
  for (const frame of frames) expect(frame.blur).toBe(8);
});

it.each(['fixed', 'follow-video'] as const)(
  'exports %s image motion with a matching rounded video boundary',
  (zoomBehavior) => {
    const context = contextFixture();
    const canvas = { width: 800, height: 450 };
    const image = { width: 800, height: 450 } as ImageBitmap;
    const background = {
      enabled: true as const,
      type: 'image' as const,
      assetId: 'image',
      imageFit: 'cover' as const,
      zoomBehavior,
      layout: { padding: 40, cornerRadius: 20 },
    };
    for (const scale of [1, 1.5, 2]) {
      vi.clearAllMocks();
      const layout = computeQuickEditSceneLayout({
        output: canvas,
        canvas,
        source: canvas,
        background,
        camera: { scale, centerX: 0.5, centerY: 0.5 },
      });
      const draw = vi.fn();
      drawReviewSceneFrame(context, { canvas, layout, background, image, sample: { draw } });
      const follows = zoomBehavior === 'follow-video';
      const clip = follows ? layout.videoTransform : layout.videoRect;
      expect(context.roundRect).toHaveBeenCalledWith(
        clip.x,
        clip.y,
        clip.width,
        clip.height,
        20 * (follows ? scale : 1)
      );
      expect(draw).toHaveBeenCalledWith(
        context,
        layout.videoTransform.x,
        layout.videoTransform.y,
        layout.videoTransform.width,
        layout.videoTransform.height
      );
      if (follows && scale > 1) {
        expect(context.translate).toHaveBeenCalledWith((1 - scale) * 400, (1 - scale) * 225);
        expect(context.scale).toHaveBeenCalledWith(scale, scale);
        expect(vi.mocked(context.restore).mock.invocationCallOrder[0]).toBeLessThan(
          draw.mock.invocationCallOrder[0]!
        );
      } else expect(context.scale).not.toHaveBeenCalled();
    }
  }
);

it('renders a transition on the unchanged result clock and releases endpoint samples', async () => {
  state.drawn.length = 0;
  state.encoded.length = 0;
  const args = argsFixture();
  args.edits = [{ ...cutEdit(0.5, 1), transition: { type: 'dissolve', before: 0.5, after: 0.5 } }];
  const receipt = await writeReviewFrames(args);
  expect(receipt.resultDuration).toBe(1.5);
  expect(state.encoded.map((sample) => sample.timestamp)).toEqual([0, 0.5, 1]);
  expect(state.drawn).toHaveLength(5);
  for (const sample of state.drawn) expect(sample.close).toHaveBeenCalledOnce();
  state.drawn.length = 0;
  await expect(
    writeReviewFrames({
      ...args,
      onProgress() {
        throw new Error('stop render');
      },
    })
  ).rejects.toThrow('stop render');
  for (const sample of state.drawn) expect(sample.close).toHaveBeenCalledOnce();
});

it('refuses an export whose retained side contains no admissible transition frame', async () => {
  state.drawn.length = 0;
  const args = argsFixture();
  args.edits = [
    { ...cutEdit(0.5, 1.75), transition: { type: 'dissolve', before: 0.5, after: 0.5 } },
  ];
  await expect(writeReviewFrames(args)).rejects.toMatchObject({
    name: 'QuickEditExportUnavailable',
    reasons: ['transition-frames'],
  });
  for (const sample of state.drawn) expect(sample.close).toHaveBeenCalledOnce();
});

it('ends the final rendered frame at the exact retained duration instead of adding a full frame', async () => {
  state.encoded.length = 0;
  const args = argsFixture();
  args.index.duration = 2.03;
  await writeReviewFrames(args);
  const last = state.encoded.at(-1)!;
  expect(last.timestamp + last.duration).toBeCloseTo(2.03, 8);
});

it.each([false, true])(
  'uses identical probe and rendered HEVC parameters at explicit 30fps (header=%s)',
  async (header) => {
    const probe = vi.fn(async (config: VideoEncoderConfig) => ({
      config,
      supported:
        config.codec.startsWith('hvc1') &&
        config.framerate === 30 &&
        config.width <= 1920 &&
        config.height <= 1080,
    }));
    vi.stubGlobal('VideoEncoder', { isConfigSupported: probe });
    state.sourceWidth = 1904;
    state.sourceHeight = 1064;
    state.encoded.length = 0;
    const args = argsFixture({ frameRate: 40 });
    if (header)
      args.advanced.windowHeader = {
        ...DEFAULT_WINDOW_HEADER,
        kind: 'browser' as const,
        title: 'Header',
      };
    const { resolveReviewOutputProfile } = await import('./render-settings');
    const index = {
      ...args.index,
      width: 1904,
      height: 1064,
      outputCodecs: { mp4: ['hevc' as const], webm: [] },
    };
    const renderSettings = {
      format: 'mp4' as const,
      codec: 'hevc' as const,
      resolution: '1080P' as const,
      quality: 'HIGH' as const,
      frameRate: 30 as const,
    };
    const profile = resolveReviewOutputProfile(index, args.advanced, renderSettings);
    await writeReviewFrames({ ...args, index, renderSettings });
    expect(profile.width).toBeLessThanOrEqual(1920);
    expect(profile.height).toBeLessThanOrEqual(1080);
    if (!header) expect(profile).toMatchObject({ width: 1904, height: 1064 });
    expect(probe).toHaveBeenCalledWith(
      expect.objectContaining({
        width: profile.width,
        height: profile.height,
        framerate: 30,
        bitrateMode: 'quantizer',
      })
    );
    expect(state.encoded).toHaveLength(60);
    for (const frame of state.encoded) {
      expect(frame.width).toBe(profile.width);
      expect(frame.height).toBe(profile.height);
      expect(frame.duration).toBeCloseTo(1 / 30);
    }
    expect(state.configurations.at(-1)).toMatchObject({
      codec: 'hevc',
      quality: expect.objectContaining({ _quantizer: 20 }),
    });
  }
);

it('publishes a warmed estimate during rendering and clears it before returning', async () => {
  const args = argsFixture();
  const onTimeEstimate = vi.fn();
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => state.encoded.length * 1000);
  state.encoded.length = 0;
  try {
    await writeReviewFrames({
      ...args,
      onTimeEstimate,
      renderSettings: { quality: 'MEDIUM', frameRate: 24 },
    });
    expect(onTimeEstimate.mock.calls.some(([estimate]) => estimate?.remainingMs > 0)).toBe(true);
    expect(onTimeEstimate).toHaveBeenLastCalledWith(null);
  } finally {
    clock.mockRestore();
  }
});

it('does not publish a render time estimate for the size-only frame probe', async () => {
  const onTimeEstimate = vi.fn();
  await writeReviewFrames({
    ...argsFixture(),
    onTimeEstimate,
    frameProbe: { add: async () => undefined },
  });
  expect(onTimeEstimate.mock.calls.every(([estimate]) => estimate === null)).toBe(true);
});

it('clears a render estimate on cancellation without retaining machine state', async () => {
  const controller = new AbortController();
  const onTimeEstimate = vi.fn();
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => state.encoded.length * 1000);
  state.encoded.length = 0;
  try {
    await expect(
      writeReviewFrames({
        ...argsFixture(),
        signal: controller.signal,
        onTimeEstimate,
        renderSettings: { quality: 'MEDIUM', frameRate: 24 },
        onProgress: () => {
          if (state.encoded.length >= 5) controller.abort();
        },
      })
    ).rejects.toThrow();
    expect(onTimeEstimate).toHaveBeenLastCalledWith(null);
  } finally {
    clock.mockRestore();
  }
});

it('routes only effective advanced presentation through the sequence writer', async () => {
  const args = argsFixture();
  args.advanced.presentation = createNewWorkspacePresentationSettings();
  const receipt = { resultDuration: 3, videoPackets: 90, audioPackets: 0, audioRanges: [] };
  presentationExport.mockResolvedValueOnce(receipt);
  expect(await writeReviewFrames({ ...args, includeBookends: false })).toBe(receipt);
  expect(presentationExport).toHaveBeenLastCalledWith(
    expect.objectContaining({ includeBookends: false })
  );
  presentationExport.mockClear();
  args.advanced.ui.mode = 'basic';
  const basic = await writeReviewFrames(args);
  expect(presentationExport).not.toHaveBeenCalled();
  expect(basic.resultDuration).toBe(2);
});
