// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import * as decoded from '../../../../features/video/composition/draw/decoded-sample';
import * as visual from './render-visual';
import type { PreviewSourceBinding } from '../../../../workflows/video/preview-source';
import type { VideoCompositionFrameSource } from '../../../../features/video/composition/draw/media-source';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import { renderPreviewScene } from './render-preview';
import type { PreviewSceneRenderInput } from './types';
it('Canvas fallback draws each exact exposure source without HTML readiness or recapture', async () => {
  const clip = createVideoClip({ id: 'source', duration: 5, sourceDuration: 5 });
  const project = createProject([clip]);
  project.width = 80;
  project.height = 40;
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 5,
      scale: 2,
      zoomInDuration: 5,
      motionBlurAmount: 1,
    },
  ];
  const passes = resolveVideoCompositionRenderPasses(project, 1);
  expect(passes.visualPasses.length).toBeGreaterThan(1);
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 80 }, clientHeight: { value: 40 } });
  const makeSource = () => ({
    sourceWidth: 80,
    sourceHeight: 40,
    draw: vi.fn(),
    toVideoFrame: vi.fn(() => {
      throw new Error('Exact source must not be recaptured');
    }),
  });
  const sources = new Map<object, ReturnType<typeof makeSource>>(
    [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)].map((frame) => [
      frame,
      makeSource(),
    ])
  );
  const release = vi.fn();
  const sourceFrames = {
    nominal: new Map([[clip.id, sources.get(passes.overlayFrame)!]]),
    intervals: new Map(),
    media: (frame: Pick<typeof passes.overlayFrame, 'visualLayers'>) => {
      const source = sources.get(frame);
      if (!source) throw new Error('Missing pose');
      return new Map([[clip.id, source]]);
    },
    release,
  };
  const input: PreviewSceneRenderInput = {
    project,
    currentTime: 1,
    canvas,
    stage: null,
    videoRefs: { current: {} },
    imageBank: {},
    previewRenderer: 'gpu',
    gpuPreview: { render: vi.fn(async () => undefined), dispose: vi.fn() },
    preparedFrame: {
      passes,
      rasterScale: 1,
      compositionTime: 1,
      sourcePresentation: new Map(),
      sourceFrames,
      gpuIsolated: false,
    },
  };
  await expect(renderPreviewScene(input)).resolves.toMatchObject({
    time: 1,
    renderer: { backend: 'legacy' },
  });
  for (const pass of passes.visualPasses) expect(sources.get(pass.frame)!.draw).toHaveBeenCalled();
  for (const source of sources.values()) expect(source.toVideoFrame).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function paddedFallbackFixture(fallback: 'unavailable' | 'device-failed' = 'unavailable') {
  const owned: PaddedFrame[] = [];
  class PaddedFrame {
    format: VideoPixelFormat;
    codedWidth: number;
    codedHeight: number;
    displayWidth: number;
    displayHeight: number;
    timestamp: number;
    duration: number | null;
    colorSpace: VideoColorSpaceInit;
    visibleRect: { x: number; y: number; width: number; height: number };
    close = vi.fn();
    allocationSize = () => 80 * 40 * 1.5;
    copyTo = vi.fn(async () => [
      { offset: 0, stride: 80 },
      { offset: 80 * 40, stride: 80 },
    ]);
    constructor(data: AllowSharedBufferSource | PaddedFrame, init: VideoFrameBufferInit) {
      const source = data instanceof PaddedFrame ? data : undefined;
      this.format = source?.format ?? init.format;
      this.codedWidth = source?.codedWidth ?? init.codedWidth;
      this.codedHeight = source?.codedHeight ?? init.codedHeight;
      this.displayWidth = init.displayWidth ?? 80;
      this.displayHeight = init.displayHeight ?? 40;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? null;
      this.colorSpace = init.colorSpace ?? source?.colorSpace ?? {};
      this.visibleRect = { x: 0, y: 0, width: 80, height: 40 };
      owned.push(this);
    }
    clone() {
      return new PaddedFrame(new Uint8Array(this.allocationSize()), {
        format: this.format,
        codedWidth: this.codedWidth,
        codedHeight: this.codedHeight,
        displayWidth: this.displayWidth,
        displayHeight: this.displayHeight,
        timestamp: this.timestamp,
        ...(this.duration === null ? {} : { duration: this.duration }),
        colorSpace: this.colorSpace,
      });
    }
  }
  vi.stubGlobal('VideoFrame', PaddedFrame);
  const clip = createVideoClip({ id: 'source', duration: 5, sourceDuration: 5 });
  const project = createProject([clip]);
  project.width = 80;
  project.height = 40;
  project.motionRegions = [
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 5,
      scale: 2,
      zoomInDuration: 5,
      motionBlurAmount: 1,
    },
  ];
  const passes = resolveVideoCompositionRenderPasses(project, 1);
  const contexts = [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)];
  const makeSource = (timestamp: number): VideoCompositionFrameSource => ({
    sourceWidth: 80,
    sourceHeight: 40,
    orientation: { rotation: 0, flip: false },
    draw: vi.fn(() => {
      throw new Error('Padded native source reached Canvas');
    }),
    toVideoFrame: vi.fn(
      () =>
        new PaddedFrame(new Uint8Array(80 * 48 * 1.5), {
          format: 'NV12',
          codedWidth: 80,
          codedHeight: 48,
          displayWidth: 80,
          displayHeight: 40,
          timestamp,
          duration: 33333,
          colorSpace: { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709' },
        }) as unknown as VideoFrame
    ),
  });
  const sources = new Map(
    contexts.map((frame, index) => [frame, makeSource(1_000_000 + index * 33333)])
  );
  const effectSource = makeSource(2_000_000);
  const intervals = new Map<string, PreviewSourceBinding>(
    [...sources.values(), effectSource].map((source, index) => [
      String(index),
      {
        source,
        timestamp: index / 30,
        nextTimestamp: (index + 1) / 30,
        target: index / 30,
        url: 'blob:original',
      },
    ])
  );
  const nominal = new Map([[clip.id, sources.get(passes.overlayFrame)!]]);
  const release = vi.fn();
  const media = vi.fn(
    (
      frame: Pick<typeof passes.overlayFrame, 'visualLayers'>,
      _time: number,
      layers?: typeof passes.overlayFrame.visualLayers
    ) =>
      new Map([
        [
          clip.id,
          layers === passes.overlayFrame.effectInputLayers
            ? effectSource
            : sources.get(frame as typeof passes.overlayFrame)!,
        ],
      ])
  );
  const sourceFrames = { nominal, intervals, media, release };
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 80 }, clientHeight: { value: 40 } });
  const controller = new AbortController();
  const capturedNominal = makeSource(3_000_000);
  const input: PreviewSceneRenderInput = {
    project,
    canvas,
    currentTime: 1,
    stage: null,
    imageBank: {},
    videoRefs: { current: {} },
    decodedVideoFrames: new Map([[clip.id, capturedNominal]]),
    signal: controller.signal,
    previewRenderer: 'gpu',
    gpuPreview: {
      render: vi.fn(async () => undefined),
      dispose: vi.fn(),
      fallbackReason: fallback,
    },
    preparedFrame: {
      passes,
      rasterScale: 1,
      compositionTime: 1,
      sourcePresentation: new Map([['source', { timestampUs: 1_000_000, durationUs: 33333 }]]),
      sourceFrames,
      gpuIsolated: false,
    },
  };
  const normalize = decoded.prepareDecodedVideoSample;
  const samples: Awaited<ReturnType<typeof normalize>>[] = [];
  const formats: Awaited<ReturnType<typeof normalize>>['format'][] = [];
  const normalizer = vi
    .spyOn(decoded, 'prepareDecodedVideoSample')
    .mockImplementation(async (sample, signal, colorSpace) => {
      const prepared = await normalize(sample, signal, colorSpace);
      samples.push(prepared);
      formats.push(prepared.format);
      vi.spyOn(prepared, 'draw').mockImplementation((context) => {
        context.fillStyle = '#ef17b9';
        context.fillRect(0, 0, 80, 40);
      });
      return prepared;
    });
  return {
    input,
    controller,
    clip,
    passes,
    sources,
    effectSource,
    intervals,
    sourceFrames,
    capturedNominal,
    release,
    owned,
    samples,
    formats,
    normalizer,
  };
}

it.each(['unavailable', 'device-failed'] as const)(
  'packs actual padded NV12 bindings for %s Canvas fallback without changing source maps or PTS',
  async (fallback) => {
    const f = paddedFallbackFixture(fallback);
    const original = f.input.preparedFrame;
    const draw = visual.drawPreviewVisualPasses;
    vi.spyOn(visual, 'drawPreviewVisualPasses').mockImplementationOnce(async (args) => {
      for (const pass of f.passes.visualPasses) {
        const media = args.sourceFrames!.media(pass.frame, pass.time);
        media.get(f.clip.id)!.draw(f.input.canvas.getContext('2d')!, 0, 0, 80, 40);
        expect(media.get(f.clip.id)).not.toBe(f.sources.get(pass.frame));
      }
      expect(args.sourceFrames).not.toBe(f.sourceFrames);
      const effect = args
        .sourceFrames!.media(f.passes.overlayFrame, 1, f.passes.overlayFrame.effectInputLayers)
        .get(f.clip.id)!;
      expect(effect).not.toBe(f.effectSource);
      expect(args.sourceFrames!.intervals).toBe(f.intervals);
      return draw(args);
    });
    await expect(renderPreviewScene(f.input)).resolves.toMatchObject({
      renderer: { backend: 'legacy', fallback },
    });
    expect(f.normalizer).toHaveBeenCalledTimes(f.intervals.size);
    expect(f.formats.every((format) => format === 'NV12')).toBe(true);
    expect(f.owned.filter((frame) => frame.codedHeight === 40)).toHaveLength(f.intervals.size);
    expect(f.owned.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
    expect(f.input.preparedFrame).toBe(original);
    expect(f.input.preparedFrame!.sourceFrames).toBe(f.sourceFrames);
    expect(f.input.preparedFrame!.sourcePresentation.get('source')!.timestampUs).toBe(1_000_000);
    expect(f.capturedNominal.toVideoFrame).not.toHaveBeenCalled();
    for (const source of f.sources.values()) expect(source.draw).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
  }
);

it('keeps successful GPU source preparation native without acquiring Canvas copies', async () => {
  const f = paddedFallbackFixture();
  vi.mocked(f.input.gpuPreview!.render).mockResolvedValueOnce(true);
  await expect(renderPreviewScene(f.input)).resolves.toMatchObject({
    renderer: { backend: 'gpu' },
  });
  expect(f.normalizer).not.toHaveBeenCalled();
  expect(f.owned).toHaveLength(0);
  expect(f.release).not.toHaveBeenCalled();
});

it('shares one normalized source identity across duplicate interval bindings', async () => {
  const f = paddedFallbackFixture();
  f.intervals.set('alias', f.intervals.values().next().value!);
  await renderPreviewScene(f.input);
  expect(f.normalizer).toHaveBeenCalledTimes(f.intervals.size - 1);
  for (const source of [...f.sources.values(), f.effectSource])
    expect(source.toVideoFrame).toHaveBeenCalledOnce();
  expect(f.owned.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(f.release).not.toHaveBeenCalled();
});

it('releases completed Canvas copies when a later source cannot be normalized', async () => {
  const f = paddedFallbackFixture();
  const normalize = f.normalizer.getMockImplementation()!;
  f.normalizer.mockImplementationOnce(normalize).mockImplementationOnce(async (sample) => {
    sample.close();
    throw new Error('Source conversion failed');
  });
  await expect(renderPreviewScene(f.input)).rejects.toThrow('Source conversion failed');
  expect(f.samples).toHaveLength(1);
  expect(f.samples[0]!.draw).not.toHaveBeenCalled();
  expect(f.owned.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(f.input.preparedFrame!.sourceFrames).toBe(f.sourceFrames);
  expect(f.release).not.toHaveBeenCalled();
});

it('retains completed copies until a pending conversion settles after abort', async () => {
  const f = paddedFallbackFixture();
  const gate = Promise.withResolvers<void>();
  const normalize = f.normalizer.getMockImplementation()!;
  f.normalizer
    .mockImplementationOnce(normalize)
    .mockImplementationOnce(async (sample, signal, colorSpace) => {
      await gate.promise;
      return normalize(sample, signal, colorSpace);
    });
  const pending = renderPreviewScene(f.input);
  await vi.waitFor(() => expect(f.normalizer).toHaveBeenCalledTimes(2));
  const completed = f.owned.find((frame) => frame.codedHeight === 40)!;
  f.controller.abort();
  expect(completed.close).not.toHaveBeenCalled();
  expect(f.release).not.toHaveBeenCalled();
  gate.resolve();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.owned.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(f.samples[0]!.draw).not.toHaveBeenCalled();
  expect(f.release).not.toHaveBeenCalled();
});

it('releases all Canvas copies on rendering failure without releasing the parent source lease', async () => {
  const f = paddedFallbackFixture();
  vi.spyOn(visual, 'drawPreviewVisualPasses').mockRejectedValueOnce(
    new Error('Canvas render failed')
  );
  await expect(renderPreviewScene(f.input)).rejects.toThrow('Canvas render failed');
  expect(f.owned.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(f.input.preparedFrame!.sourceFrames).toBe(f.sourceFrames);
  expect(f.release).not.toHaveBeenCalled();
});

it('retains normalized sources through asynchronous Canvas work and discards an aborted result', async () => {
  const f = paddedFallbackFixture();
  const gate = Promise.withResolvers<void>();
  const draw = visual.drawPreviewVisualPasses;
  vi.spyOn(visual, 'drawPreviewVisualPasses').mockImplementationOnce(async (args) => {
    await gate.promise;
    return draw(args);
  });
  const pending = renderPreviewScene(f.input);
  await vi.waitFor(() => expect(f.normalizer).toHaveBeenCalledTimes(f.intervals.size));
  expect(
    f.owned
      .filter((frame) => frame.codedHeight === 40)
      .every((frame) => frame.close.mock.calls.length === 0)
  ).toBe(true);
  f.controller.abort();
  gate.resolve();
  await expect(pending).resolves.toBe(false);
  expect(f.owned.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(f.release).not.toHaveBeenCalled();
});

it('freezes an owned RGB Native source when VideoFrame is absent', async () => {
  vi.stubGlobal('VideoFrame', undefined);
  const rgbContext = document.createElement('canvas').getContext('2d')!;
  vi.spyOn(rgbContext, 'drawImage').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(rgbContext);
  const clip = createVideoClip({ id: 'source', duration: 5, sourceDuration: 5 });
  const project = createProject([clip]);
  project.width = 80;
  project.height = 40;
  const video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { value: 2 },
    videoWidth: { value: 80 },
    videoHeight: { value: 40 },
  });
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 80 }, clientHeight: { value: 40 } });
  const original = visual.drawPreviewVisualPasses;
  let snapshot: HTMLCanvasElement | undefined;
  vi.spyOn(visual, 'drawPreviewVisualPasses').mockImplementation(async (args) => {
    const source = args.clipMediaElements.get(clip.id) as VideoCompositionFrameSource;
    expect(source.toVideoFrame).toBeUndefined();
    const drawImage = vi.fn();
    source.draw({ drawImage } as unknown as CanvasRenderingContext2D, 0, 0, 80, 40);
    snapshot = drawImage.mock.calls[0]![0] as HTMLCanvasElement;
    expect(snapshot).not.toBe(video);
    expect(snapshot.width).toBe(80);
    return original(args);
  });
  await expect(
    renderPreviewScene({
      project,
      currentTime: 1,
      canvas,
      stage: null,
      imageBank: {},
      videoRefs: { current: { source: video } },
      previewRenderer: 'legacy',
    })
  ).resolves.toMatchObject({ renderer: { backend: 'legacy' } });
  expect(snapshot?.width).toBe(0);
});
