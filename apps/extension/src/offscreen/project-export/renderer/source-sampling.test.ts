import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import {
  VideoProjectAssetType,
  VideoExportFormat,
  VideoExportQualityPreset,
  type VideoProjectAsset,
  type VideoProject,
} from '../../../features/video/project/types';
import { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import {
  classifyNativeExportSamplingDemand,
  resolveNativeSourceSamplingDemands,
} from './source-sampling-plan';
import { createProjectExportSourceSampling } from './source-sampling';
import type { VideoCompositionFrameSource } from '../../../features/video/composition/draw/media-source';
function fixture() {
  const project = createEmptyVideoProject('Sampling', 640, 360);
  const asset: VideoProjectAsset = {
    id: 'asset',
    createdAt: 1,
    name: 'Video',
    type: VideoProjectAssetType.VIDEO,
    source: { kind: 'project-asset', projectAssetId: 'media' },
    metadata: {
      width: 640,
      height: 360,
      duration: 4,
      hasAudio: false,
      audioPeaks: null,
      mimeType: 'video/webm',
      size: 100,
    },
  };
  project.assets = [asset];
  project.duration = 4;
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected video fixture');
  project.clips = [clip];
  const settings = {
    format: VideoExportFormat.WEBM,
    webmVideoCodec: 'VP9' as const,
    width: 640,
    height: 360,
    fps: 30,
    resolution: 'SOURCE' as const,
    quality: VideoExportQualityPreset.MEDIUM,
    downloadAfterExport: false,
    detailEnhancement: 'bicubic-sharpen' as const,
  };
  return { project, clip, settings };
}
it('proves static no-growth over the whole window and keeps unknown animation out of copy admission', () => {
  const f = fixture();
  expect(classifyNativeExportSamplingDemand(f.project, f.settings)).toBe('none');
  expect(
    classifyNativeExportSamplingDemand(f.project, { ...f.settings, width: 1280, height: 720 })
  ).toBe('growth');
  f.project.motionRegions = [{}] as NonNullable<typeof f.project.motionRegions>;
  expect(classifyNativeExportSamplingDemand(f.project, f.settings)).toBe('unknown');
  expect(
    classifyNativeExportSamplingDemand(f.project, { ...f.settings, detailEnhancement: 'off' })
  ).toBe('none');
});
it('derives original ROI and exact source/pass identity from the same composition geometry', () => {
  const f = fixture();
  const frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  frame.camera.scale = 2;
  frame.camera.viewportX = 160;
  frame.camera.viewportY = 90;
  const result = resolveNativeSourceSamplingDemands({
    project: f.project,
    settings: f.settings,
    frame,
    time: 1,
  });
  expect(result).toHaveLength(1);
  expect(result[0]!.demands[0]!.id).toBe('body');
  expect(result[0]!.demands[0]!.sourceTime).toBe(1);
  expect(result[0]!.demands[0]!.passTime).toBe(1);
  expect(result[0]!.demands[0]!.originalPixelROI).toEqual({
    x: 160,
    y: 90,
    width: 320,
    height: 180,
  });
  expect(result[0]!.demands[0]!.targetRasterSize).toEqual({ width: 640, height: 360 });
});
it('off creates no sample reader, canvas or backend and disposal remains asynchronous', async () => {
  const f = fixture();
  const createSamples = vi.fn();
  const enhancer = { withEnhancedRegion: vi.fn(), dispose: vi.fn(async () => {}) };
  const owner = createProjectExportSourceSampling({
    project: f.project,
    settings: { ...f.settings, detailEnhancement: 'off' },
    sourceUrl: () => 'media',
    enhancer,
    createSamples,
  });
  await owner.dispose();
  expect(createSamples).not.toHaveBeenCalled();
  expect(enhancer.withEnhancedRegion).not.toHaveBeenCalled();
});

it('never proves a static span from a hidden camera midpoint when the camera is visible at its tail', () => {
  const f = fixture();
  f.clip.cameraHiddenRanges = [{ id: 'hidden', start: 1, end: 3 }];
  expect(
    classifyNativeExportSamplingDemand(f.project, { ...f.settings, width: 1280, height: 720 })
  ).toBe('unknown');
});
it('limits scene lens ROI through its composed centered zoom and merges deferred source rows', async () => {
  const { createQuickEditSpotlight } =
    await import('../../../features/video/project/scene/focus-appearance');
  const f = fixture(),
    frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  frame.camera.scale = 2;
  frame.camera.viewportX = 160;
  frame.camera.viewportY = 90;
  frame.sceneSpotlights = [
    {
      id: 'lens',
      phase: 'hold',
      progress: 1,
      spotlight: {
        ...createQuickEditSpotlight(),
        effect: 'magnify',
        magnification: 2,
        area: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
      },
    },
  ];
  const first = frame.visualLayers[0]!;
  frame.visualLayers.push({ ...first, effectActionsOnly: true });
  const plans = resolveNativeSourceSamplingDemands({
    project: f.project,
    settings: f.settings,
    frame,
    time: 1,
  });
  expect(plans).toHaveLength(1);
  expect(plans[0]!.demands.map((d) => d.id)).toEqual(['body', 'sceneLens:lens']);
  const lens = plans[0]!.demands[1]!;
  expect(lens.originalPixelROI.width).toBeCloseTo(32, 9);
  expect(lens.originalPixelROI.height).toBeCloseTo(18, 9);
  expect(lens.targetRasterSize).toEqual({ width: 128, height: 72 });
});
it('gives unrestricted source-owning FX a full original input while the ordinary body stays cropped', () => {
  const f = fixture(),
    frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  frame.camera.scale = 2;
  frame.camera.viewportX = 160;
  frame.camera.viewportY = 90;
  frame.effectRuntimePlans = [
    {
      assets: [],
      controls: {},
      dimensions: { width: 640, height: 360 },
      renderDimensions: { width: 640, height: 360 },
      documentSha256: 'a'.repeat(64),
      documentSource: '{}',
      duration: 4,
      effectInstanceId: 'effect',
      fps: 30,
      frameIndex: 30,
      kind: 'targetEffect',
      progress: 0.25,
      snapshotId: 'snapshot',
      time: 1,
      target: {
        kind: 'clip',
        clipId: f.clip.id,
        chainIndex: 0,
        placement: { x: 0, y: 0, width: 640, height: 360, rotation: 0, opacity: 1 },
      },
    },
  ];
  const demands = resolveNativeSourceSamplingDemands({
    project: f.project,
    settings: f.settings,
    frame,
    time: 1,
  })[0]!.demands;
  expect(demands.find((d) => d.id === 'body')!.originalPixelROI.x).toBe(160);
  const fx = demands.find((d) => d.id === 'effectInput')!;
  // A program can move an original marker at x=8 into the visible output; this domain must remain present.
  expect(fx.originalPixelROI).toEqual({ x: 0, y: 0, width: 640, height: 360 });
  expect(fx.targetRasterSize).toEqual({ width: 1280, height: 720 });
  frame.effectRuntimePlans[0]!.target = { kind: 'scene', clipId: 'overlay' };
  expect(
    resolveNativeSourceSamplingDemands({
      project: f.project,
      settings: f.settings,
      frame,
      time: 1,
    })[0]!.demands.some((d) => d.id === 'effectInput')
  ).toBe(false);
});
function preparationFixture() {
  const f = fixture(),
    frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  frame.camera.scale = 2;
  frame.camera.viewportX = 160;
  frame.camera.viewportY = 90;
  const clones: Array<{
    displayWidth: number;
    displayHeight: number;
    timestamp: number;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const source = {
    sourceWidth: 640,
    sourceHeight: 360,
    toVideoFrame: vi.fn(() => {
      const clone = { displayWidth: 640, displayHeight: 360, timestamp: 1_000_000, close: vi.fn() };
      clones.push(clone);
      return clone as unknown as VideoFrame;
    }),
    draw: vi.fn(),
  };
  const media = new Map<string, VideoCompositionFrameSource>([[f.clip.id, source]]);
  const sample = vi.fn(
    async (
      _time: number,
      _signal: AbortSignal,
      _policy: 'first' | 'last',
      _project?: VideoProject
    ) => ({ media, bindings: new Map<string, never>(), forFrame: () => media, release: vi.fn() })
  );
  const sampleDispose = vi.fn();
  const createSamples = vi.fn(() => ({ sample, dispose: sampleDispose }));
  const copies: Array<ReturnType<typeof vi.fn>> = [];
  const canvases: Array<{ width: number; height: number }> = [];
  const refuseContext = vi.fn(() => false);
  const ownerDocument = {
    createElement: vi.fn(() => {
      const drawImage = vi.fn();
      copies.push(drawImage);
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => (refuseContext() ? null : { drawImage }),
      };
      canvases.push(canvas);
      return canvas;
    }),
  } as unknown as Document;
  const withEnhancedRegion = vi.fn<
    import('../../../features/video/composition/export-enhancement/enhancer').ExportEnhancer['withEnhancedRegion']
  >(async (request, consume) => {
    const size = request.targetSize;
    await consume({
      image: { width: size.width, height: size.height } as HTMLCanvasElement,
      sourceRect: { x: 0, y: 0, ...size },
      destination: { x: 0, y: 0, ...size },
    });
    return { applied: true, tileCount: 1 };
  });
  const enhancer = { withEnhancedRegion, dispose: vi.fn(async () => {}) };
  const owner = createProjectExportSourceSampling({
    project: f.project,
    settings: f.settings,
    sourceUrl: () => 'source',
    enhancer,
    createSamples,
    ownerDocument,
  });
  return {
    ...f,
    frame,
    source,
    media,
    clones,
    sample,
    sampleDispose,
    createSamples,
    copies,
    canvases,
    refuseContext,
    owner,
    enhancer,
  };
}
it('borrows the exact retained endpoint sample and keeps owned tiles and clones until pass release', async () => {
  const f = preparationFixture();
  const pass = await f.owner.prepare({
    project: f.project,
    frame: f.frame,
    time: 1,
    media: f.media,
  });
  expect(f.createSamples).not.toHaveBeenCalled();
  expect(f.enhancer.withEnhancedRegion.mock.calls[0]![0].source).toBe(f.clones[0]);
  expect(f.clones[0]!.close).not.toHaveBeenCalled();
  expect(f.source.draw).not.toHaveBeenCalled();
  const source = pass.media.get(f.clip.id)!;
  if (!('preparedSampling' in source) || !source.preparedSampling)
    throw Error('Missing prepared source');
  const seen: unknown[] = [];
  source.preparedSampling.visitPreparedTiles('body', (tile) => seen.push(tile.originalPixelROI));
  expect(seen).toEqual([{ x: 160, y: 90, width: 320, height: 180 }]);
  pass.release();
  pass.release();
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  await f.owner.dispose();
  expect(f.enhancer.dispose).toHaveBeenCalledOnce();
});
it('acquires distinct exposure times through the existing reader and never changes the job media map', async () => {
  const f = preparationFixture();
  const first = await f.owner.prepare({
    project: f.project,
    frame: f.frame,
    time: 1.1,
    sceneTime: 1,
    media: f.media,
  });
  expect(f.sample.mock.calls[0]![0]).toBe(1.1);
  expect(f.media.get(f.clip.id)).toBe(f.source);
  await f.owner.prepare({
    project: f.project,
    frame: f.frame,
    time: 1.2,
    sceneTime: 1,
    media: f.media,
  });
  expect(f.sample.mock.calls[1]![0]).toBe(1.2);
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  expect(first.media.get(f.clip.id)).not.toBe(f.source);
  await f.owner.dispose();
  expect(f.sampleDispose).toHaveBeenCalledOnce();
});
it('drains an inference before cancellation releases its exact source clone', async () => {
  const f = preparationFixture();
  let complete!: () => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const inference = new Promise<void>((resolve) => {
    complete = resolve;
  });
  f.enhancer.withEnhancedRegion.mockImplementationOnce(async () => {
    started();
    await inference;
    return { applied: false, tileCount: 0 };
  });
  const controller = new AbortController();
  const pending = f.owner.prepare({
    project: f.project,
    frame: f.frame,
    time: 1,
    media: f.media,
    signal: controller.signal,
  });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await entered;
  controller.abort();
  const disposing = f.owner.dispose();
  expect(f.clones[0]!.close).not.toHaveBeenCalled();
  expect(f.enhancer.dispose).not.toHaveBeenCalled();
  complete();
  await rejected;
  await disposing;
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  expect(f.enhancer.dispose).toHaveBeenCalledOnce();
});
it('refuses impossible full FX extents before inference and preserves the borrowed original', async () => {
  const f = preparationFixture();
  f.frame.camera.scale = 100;
  f.frame.effectRuntimePlans = [
    {
      assets: [],
      controls: {},
      dimensions: { width: 640, height: 360 },
      renderDimensions: { width: 640, height: 360 },
      documentSha256: 'a'.repeat(64),
      documentSource: '{}',
      duration: 4,
      effectInstanceId: 'effect',
      fps: 30,
      frameIndex: 30,
      kind: 'targetEffect',
      progress: 0.25,
      snapshotId: 'snapshot',
      time: 1,
      target: {
        kind: 'clip',
        clipId: f.clip.id,
        chainIndex: 0,
        placement: { x: 0, y: 0, width: 640, height: 360, rotation: 0, opacity: 1 },
      },
    },
  ];
  await expect(
    f.owner.prepare({ project: f.project, frame: f.frame, time: 1, media: f.media })
  ).rejects.toMatchObject({ code: 'runtimeResourceLimit' });
  expect(f.enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  expect(f.clones).toHaveLength(0);
  expect(f.source.draw).not.toHaveBeenCalled();
  await f.owner.dispose();
});

async function sharpFixture(failAt = Infinity) {
  const { createQuickEditSpotlight } =
    await import('../../../features/video/project/scene/focus-appearance');
  const { createNativeSharpStages } = await import('./source-sharp-stage');
  const f = fixture(),
    frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  frame.sceneSpotlights = ['one', 'two'].map((id) => ({
    id,
    phase: 'hold' as const,
    progress: 1,
    spotlight: {
      ...createQuickEditSpotlight(),
      effect: 'magnify' as const,
      magnification: 2,
      area: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
    },
  }));
  const canvases: Array<{ width: number; height: number; context: CanvasRenderingContext2D }> = [];
  const releases: ReturnType<typeof vi.fn>[] = [];
  const sampling = {
    reserveRaster: vi.fn(() => {
      const release = vi.fn();
      releases.push(release);
      return release;
    }),
  } as unknown as import('./source-sampling').ProjectExportSourceSampling;
  const document = {
    createElement: vi.fn(() => {
      const context = {
        save: vi.fn(),
        restore: vi.fn(),
        setTransform: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
      const canvas = {
        width: 0,
        height: 0,
        context,
        getContext: () => (canvases.length === failAt ? null : context),
      };
      canvases.push(canvas);
      return canvas;
    }),
  } as unknown as Document;
  return {
    ...f,
    frame,
    canvases,
    releases,
    sampling,
    create: () =>
      createNativeSharpStages({
        project: f.project,
        settings: f.settings,
        frame,
        images: {},
        sampling,
        document,
      }),
  };
}
it('projects the sharp aperture into a bounded target and retains it through publish with release once', async () => {
  const f = await sharpFixture();
  f.frame.sceneSpotlights = f.frame.sceneSpotlights!.slice(0, 1);
  const [stage] = f.create();
  expect(stage!.output).toEqual({ width: 128, height: 72 });
  expect(f.sampling.reserveRaster).toHaveBeenCalledWith(128, 72);
  expect(stage!.transform).toEqual([2, 0, -576, 0, 2, -324, 0, 0, 1]);
  const paint = vi.fn();
  stage!.paint(paint);
  expect(paint).toHaveBeenCalledWith(f.canvases[0]!.context);
  expect(f.canvases[0]!.context.restore).toHaveBeenCalledOnce();
  const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  stage!.publish(target);
  expect(target.drawImage).toHaveBeenCalledWith(f.canvases[0], 256, 144, 128, 72);
  expect(f.releases[0]).not.toHaveBeenCalled();
  stage!.dispose();
  stage!.dispose();
  expect(f.releases[0]).toHaveBeenCalledOnce();
  expect(f.canvases[0]!.width).toBe(0);
  expect(() => stage!.publish(target)).toThrow('disposed');
});
it('returns failed-current and prior stage reservations when later canvas creation fails', async () => {
  const f = await sharpFixture(2);
  expect(f.create).toThrow('Sharp export stage is unavailable');
  expect(f.releases).toHaveLength(2);
  for (const release of f.releases) expect(release).toHaveBeenCalledOnce();
  for (const canvas of f.canvases) expect([canvas.width, canvas.height]).toEqual([0, 0]);
});
it('refuses a projected aperture whose corner has no finite projection', async () => {
  const { projectNativeSamplingRect } = await import('./source-sampling-plan');
  expect(() =>
    projectNativeSamplingRect([1, 0, 0, 0, 1, 0, 1, 0, 0], { x: 0, y: 0, width: 1, height: 1 })
  ).toThrow('horizon');
});
it('paints prepared cropped body tiles once at the inherited alpha without an original underlay', async () => {
  const { drawVideoLayer } = await import('../../../features/video/composition/draw/video');
  const { createVisualTestContext } =
    await import('../../../features/video/composition/draw/visual.test-support');
  vi.stubGlobal('HTMLVideoElement', class {});
  try {
    const f = preparationFixture();
    const pass = await f.owner.prepare({
      project: f.project,
      frame: f.frame,
      time: 1,
      media: f.media,
    });
    const context = createVisualTestContext();
    context.globalAlpha = 0.4;
    const layer = f.frame.visualLayers[0]!;
    if (layer.kind !== 'video') throw new Error('Expected video');
    drawVideoLayer(context, layer, layer, 1, pass.media, {});
    expect(f.source.draw).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(vi.mocked(context.drawImage).mock.lastCall!.slice(5)).toEqual([160, 90, 320, 180]);
    expect(context.globalAlpha).toBe(0.4);
    pass.release();
    await f.owner.dispose();
  } finally {
    vi.unstubAllGlobals();
  }
});
it('uses the same rounded joined-header source mapping as the dense body painter', async () => {
  const { DEFAULT_WINDOW_HEADER } = await import('@sniptale/runtime-contracts/window-header');
  const { windowHeaderImageKey } =
    await import('../../../features/video/composition/draw/window-header');
  const { resolveFittedWindowRaster } =
    await import('../../../features/video/composition/draw/fitted-media');
  const f = fixture(),
    frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  const layer = frame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.clip = { ...layer.clip, windowHeader: DEFAULT_WINDOW_HEADER };
  Object.assign(layer, { x: 2.2, y: 4.4, width: 100.3, height: 50.7 });
  frame.camera.scale = 2;
  const header = { complete: true, naturalWidth: 640, naturalHeight: 23 } as HTMLImageElement;
  const images = { [windowHeaderImageKey(layer.clipId, DEFAULT_WINDOW_HEADER)]: header };
  const source = resolveFittedWindowRaster(
    {
      frame: layer,
      fitMode: layer.clip.fitMode,
      sourceWidth: 640,
      sourceHeight: 360,
      windowHeader: DEFAULT_WINDOW_HEADER,
    },
    2,
    23
  ).source;
  const [plan] = resolveNativeSourceSamplingDemands({
    project: f.project,
    settings: f.settings,
    frame,
    time: 1,
    images,
  });
  const h = plan!.demands[0]!.sourceToOutputHomography;
  expect(h[0]).toBeCloseTo((2 * source.width) / 640, 12);
  expect(h[4]).toBeCloseTo((2 * source.height) / 360, 12);
  expect(h[2]).toBeCloseTo(2 * source.x, 12);
  expect(h[5]).toBeCloseTo(2 * source.y, 12);
});
it.each([
  { rotation: 90 as const, flip: false },
  { rotation: 180 as const, flip: false },
  { rotation: 0 as const, flip: true },
])(
  'normalizes raw FrameSource display orientation %j before inference and retains it until drain',
  async (orientation) => {
    const f = preparationFixture();
    const source = {
      ...f.source,
      orientation,
      draw: vi.fn(
        (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) =>
          context.drawImage(
            { rawOriented: true } as unknown as CanvasImageSource,
            x,
            y,
            width,
            height
          )
      ),
    };
    const media = new Map([[f.clip.id, source]]);
    const pass = await f.owner.prepare({ project: f.project, frame: f.frame, time: 1, media });
    expect(source.draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 360);
    const raw = f.enhancer.withEnhancedRegion.mock.calls[0]![0].source as HTMLCanvasElement;
    expect(raw).not.toBe(f.clones[0]);
    expect([raw.width, raw.height]).toEqual([640, 360]);
    pass.release();
    expect([raw.width, raw.height]).toEqual([0, 0]);
    expect(f.clones[0]!.close).toHaveBeenCalledOnce();
    await f.owner.dispose();
  }
);
it('aligns spatial joined-header mapping to each body and sharp-stage capture density', async () => {
  const { DEFAULT_WINDOW_HEADER } = await import('@sniptale/runtime-contracts/window-header');
  const { createQuickEditSpotlight } =
    await import('../../../features/video/project/scene/focus-appearance');
  const { windowHeaderImageKey } =
    await import('../../../features/video/composition/draw/window-header');
  const { resolveFittedWindowRaster } =
    await import('../../../features/video/composition/draw/fitted-media');
  const f = fixture(),
    frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  const layer = frame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.clip = { ...layer.clip, windowHeader: DEFAULT_WINDOW_HEADER };
  Object.assign(layer, { x: 280, y: 160, width: 100.3, height: 50.7 });
  frame.camera.spatial = {
    rotation: [0, 0, 0, 1],
    perspective: 0,
    windowMotion: 0,
    lockBackground: false,
    focus: [],
    reference: { x: 0, y: 0, width: 640, height: 360 },
  };
  frame.sceneSpotlights = [
    {
      id: 'lens',
      phase: 'hold',
      progress: 1,
      spotlight: {
        ...createQuickEditSpotlight(),
        effect: 'magnify',
        magnification: 2,
        area: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
      },
    },
  ];
  const header = { complete: true, naturalWidth: 640, naturalHeight: 23 } as HTMLImageElement,
    images = { [windowHeaderImageKey(layer.clipId, DEFAULT_WINDOW_HEADER)]: header };
  const [plan] = resolveNativeSourceSamplingDemands({
    project: f.project,
    settings: f.settings,
    frame,
    time: 1,
    images,
  });
  expect(plan!.sourceRasterScale).toBeCloseTo(2, 10);
  const sourceFor = (id: string) =>
    resolveFittedWindowRaster(
      {
        frame: layer,
        fitMode: layer.clip.fitMode,
        sourceWidth: 640,
        sourceHeight: 360,
        windowHeader: DEFAULT_WINDOW_HEADER,
      },
      plan!.captureScales.get(id)!,
      23
    ).source;
  expect(plan!.captureScales.get('body')).toBeCloseTo(1, 10);
  expect(plan!.captureScales.get('sceneLens:lens')).toBeCloseTo(2, 10);
  expect(plan!.demands.find((d) => d.id === 'body')!.sourceToOutputHomography[4]).toBeCloseTo(
    sourceFor('body').height / 360,
    12
  );
  expect(
    plan!.demands.find((d) => d.id === 'sceneLens:lens')!.sourceToOutputHomography[4]
  ).toBeCloseTo((2 * sourceFor('sceneLens:lens').height) / 360, 12);
});
it('preserves the incoming fractional endpoint FrameSource and uses the camera-adjusted held video clock', async () => {
  const f = preparationFixture();
  f.clip.sourceStart = 0.015;
  f.clip.cameraTiming = { offsetSeconds: 0.1, transitions: 'bounded' };
  f.clip.playbackWindow = { offset: 0, holdAt: 0.5 };
  const frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  frame.camera.scale = 2;
  const pass = await f.owner.prepare({
    project: f.project,
    frame,
    time: 1,
    sceneTime: 1,
    media: f.media,
  });
  expect(f.createSamples).not.toHaveBeenCalled();
  expect(f.sample).not.toHaveBeenCalled();
  expect(f.enhancer.withEnhancedRegion.mock.calls[0]![0].source).toBe(f.clones[0]);
  const sampling = pass.media.get(f.clip.id);
  if (!sampling || !('preparedSampling' in sampling)) throw new Error('Expected prepared source');
  expect(sampling.preparedSampling!.sourceTime).toBeCloseTo(0.415, 12);
  pass.release();
  await f.owner.dispose();
});
it('uses first at fractional boundaries and retains it for endpoint exposures', async () => {
  const f = preparationFixture();
  f.clip.sourceStart = 0.015;
  f.clip.cameraTiming = { offsetSeconds: 0.005, transitions: 'bounded' };
  const frame = resolveVideoCompositionRenderPasses(f.project, 0).overlayFrame;
  frame.camera.scale = 2;
  const input = new Map([[f.clip.id, {} as HTMLVideoElement]]);
  let pass = await f.owner.prepare({ project: f.project, frame, time: 0.01, media: input });
  expect(f.sample).toHaveBeenLastCalledWith(0.01, expect.anything(), 'first', f.project);
  pass.release();
  pass = await f.owner.prepare({
    project: f.project,
    frame,
    time: 0.01,
    sceneTime: 0,
    fallback: 'first',
    media: f.media,
  });
  expect(f.sample).toHaveBeenLastCalledWith(0.01, expect.anything(), 'first', f.project);
  pass.release();
  await f.owner.dispose();
});
it('combines global and isolated lenses in one original-source aperture', async () => {
  const { createQuickEditSpotlight } =
    await import('../../../features/video/project/scene/focus-appearance');
  const f = fixture(),
    frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  frame.camera.scale = 2;
  frame.camera.viewportX = 160;
  frame.camera.viewportY = 90;
  const spotlight = {
    ...createQuickEditSpotlight(),
    effect: 'magnify' as const,
    magnification: 2,
    area: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
  };
  frame.sceneSpotlights = [{ id: 'outer', phase: 'hold', progress: 1, spotlight }];
  const layer = frame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.spotlights = [{ id: 'inner', phase: 'hold', progress: 1, spotlight }];
  const [plan] = resolveNativeSourceSamplingDemands({
    project: f.project,
    settings: f.settings,
    frame,
    time: 1,
  });
  const demand = plan!.demands.find((d) => d.id === 'sceneLens:outer/sceneLens:inner')!;
  expect(demand).toBeDefined();
  expect(demand.sourceToOutputHomography[0]).toBe(8);
  expect(demand.originalPixelROI.width).toBeCloseTo(16, 9);
  expect(demand.originalPixelROI.height).toBeCloseTo(9, 9);
  expect(demand.targetRasterSize).toEqual({ width: 128, height: 72 });
});
it('shares sharp-stage and tile budgets and recovers without changing borrowed media', async () => {
  const f = preparationFixture(),
    releases = Array.from({ length: 4 }, () => f.owner.reserveRaster(3840, 2160));
  releases.push(f.owner.reserveRaster(500, 500));
  await expect(
    f.owner.prepare({ project: f.project, frame: f.frame, time: 1, media: f.media })
  ).rejects.toMatchObject({ code: 'runtimeResourceLimit' });
  expect(f.enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  expect(f.media.get(f.clip.id)).toBe(f.source);
  for (const release of releases) {
    release();
    release();
  }
  const pass = await f.owner.prepare({
    project: f.project,
    frame: f.frame,
    time: 1,
    media: f.media,
  });
  expect(f.enhancer.withEnhancedRegion).toHaveBeenCalledOnce();
  pass.release();
  await f.owner.dispose();
});
it('keeps enhanced header-window pixels out of the bounded decoration raster', async () => {
  const { drawVideoLayer } = await import('../../../features/video/composition/draw/video');
  const { createVisualTestContext } =
    await import('../../../features/video/composition/draw/visual.test-support');
  const { DEFAULT_WINDOW_HEADER } = await import('@sniptale/runtime-contracts/window-header');
  const { windowHeaderImageKey } =
    await import('../../../features/video/composition/draw/window-header');
  const pool = await import('../../../features/video/composition/canvas/buffer-pool');
  vi.stubGlobal('HTMLVideoElement', class {});
  const plane = createVisualTestContext();
  Object.assign(plane, { setTransform: vi.fn(), clearRect: vi.fn(), reset: vi.fn() });
  const scratch = Object.assign(plane.canvas, { width: 0, height: 0, getContext: () => plane });
  const spy = vi
    .spyOn(pool, 'acquireVideoCompositionBuffer')
    .mockImplementation((width, height) => {
      scratch.width = width;
      scratch.height = height;
      return { canvas: scratch, release: vi.fn() };
    });
  const f = preparationFixture();
  try {
    f.clip.windowHeader = DEFAULT_WINDOW_HEADER;
    const header = { complete: true, naturalWidth: 640, naturalHeight: 23 } as HTMLImageElement,
      images = { [windowHeaderImageKey(f.clip.id, DEFAULT_WINDOW_HEADER)]: header };
    const pass = await f.owner.prepare({
      project: f.project,
      frame: f.frame,
      time: 1,
      media: f.media,
      images,
    });
    const context = createVisualTestContext();
    Object.assign(context, { getTransform: () => ({ a: 2, b: 0, c: 0, d: 2 }) });
    const layer = f.frame.visualLayers[0]!;
    if (layer.kind !== 'video') throw new Error('Expected video');
    drawVideoLayer(context, layer, layer, 1, pass.media, images);
    expect(plane.drawImage).toHaveBeenCalledOnce();
    expect(vi.mocked(plane.drawImage).mock.calls[0]![0]).toBe(header);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(f.source.draw).not.toHaveBeenCalled();
    pass.release();
  } finally {
    await f.owner.dispose();
    spy.mockRestore();
    vi.unstubAllGlobals();
  }
});
it('retains body density without model work at original source resolution', async () => {
  const f = preparationFixture();
  f.project.assets[0]!.metadata.width = 1280;
  f.project.assets[0]!.metadata.height = 720;
  const toVideoFrame = vi.fn<() => VideoFrame>(),
    source = { sourceWidth: 1280, sourceHeight: 720, draw: vi.fn(), toVideoFrame };
  const pass = await f.owner.prepare({
    project: f.project,
    frame: f.frame,
    time: 1,
    media: new Map([[f.clip.id, source]]),
  });
  expect(pass.sourceRasterScale).toBeCloseTo(2, 10);
  expect(pass.rasterScaleForDemand('body')).toBeCloseTo(2, 10);
  expect(f.enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  expect(toVideoFrame).not.toHaveBeenCalled();
  expect(f.createSamples).not.toHaveBeenCalled();
  const view = pass.media.get(f.clip.id);
  expect(view && 'renderResources' in view && view.renderResources).toBeDefined();
  await f.owner.dispose();
});
it('admits spotlight scratch in the tile budget and refuses before allocation', async () => {
  const { drawVideoLayer } = await import('../../../features/video/composition/draw/video');
  const { createVisualTestContext } =
    await import('../../../features/video/composition/draw/visual.test-support');
  const { createQuickEditSpotlight } =
    await import('../../../features/video/project/scene/focus-appearance');
  vi.stubGlobal('HTMLVideoElement', class {});
  const f = preparationFixture();
  const releases: (() => void)[] = [];
  try {
    const layer = f.frame.visualLayers[0]!;
    if (layer.kind !== 'video') throw new Error('Expected video');
    layer.spotlights = [
      {
        id: 'source-lens',
        phase: 'hold',
        progress: 1,
        spotlight: {
          ...createQuickEditSpotlight(),
          effect: 'magnify',
          magnification: 2,
          area: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
        },
      },
    ];
    const pass = await f.owner.prepare({
      project: f.project,
      frame: f.frame,
      time: 1,
      media: f.media,
    });
    for (let i = 0; i < 4; i++) releases.push(f.owner.reserveRaster(3840, 2160));
    const allocations = f.copies.length;
    expect(() =>
      drawVideoLayer(createVisualTestContext(), layer, layer, 1, pass.media, {})
    ).toThrow('Effect runtime resource limit exceeded');
    expect(f.copies).toHaveLength(allocations);
    expect(f.source.draw).not.toHaveBeenCalled();
    const source = pass.forDemand('outside-lens').get(f.clip.id);
    if (!source || !('renderResources' in source) || !source.renderResources)
      throw new Error('Missing raw resource port');
    expect(() => source.renderResources!.bytes('mask', 1024 * 1024)).toThrow(
      'Effect runtime resource limit exceeded'
    );
    for (const release of releases) release();
    pass.release();
  } finally {
    for (const release of releases) release();
    await f.owner.dispose();
    vi.unstubAllGlobals();
  }
});

it('prepares off-mode ports without decoding or changing the original media', async () => {
  const f = fixture();
  const enhancer = { withEnhancedRegion: vi.fn(), dispose: vi.fn(async () => {}) };
  const createSamples = vi.fn();
  const owner = createProjectExportSourceSampling({
    project: f.project,
    settings: { ...f.settings, detailEnhancement: 'off' },
    sourceUrl: () => 'source',
    enhancer,
    createSamples,
  });
  const media = new Map(),
    frame = resolveVideoCompositionRenderPasses(f.project, 1).overlayFrame;
  const pass = await owner.prepare({ project: f.project, frame, time: 1, media });
  expect(pass.media).toBe(media);
  expect(pass.forDemand('body')).toBe(media);
  expect(pass.sourceRasterScale).toBe(1);
  expect(pass.rasterScaleForDemand('body')).toBe(1);
  pass.release();
  expect(createSamples).not.toHaveBeenCalled();
  expect(enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  await owner.dispose();
});

it('reuses a completed pass only for its exact source and exposure identity', async () => {
  const f = preparationFixture();
  const input = { project: f.project, frame: f.frame, time: 1, media: f.media };
  const first = await f.owner.prepare(input);
  expect(await f.owner.prepare(input)).toBe(first);
  expect(f.enhancer.withEnhancedRegion).toHaveBeenCalledOnce();
  const second = await f.owner.prepare({ ...input, media: new Map(f.media) });
  expect(second).not.toBe(first);
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  f.owner.releasePass();
  f.owner.releasePass();
  expect(f.clones[1]!.close).toHaveBeenCalledOnce();
  await f.owner.dispose();
});

it('rejects a pre-aborted request before acquiring media or starting inference', async () => {
  const f = preparationFixture(),
    controller = new AbortController();
  controller.abort();
  await expect(
    f.owner.prepare({
      project: f.project,
      frame: f.frame,
      time: 1,
      media: f.media,
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.clones).toHaveLength(0);
  expect(f.createSamples).not.toHaveBeenCalled();
  expect(f.enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  await f.owner.dispose();
});

it('refuses overlapping work and drains source ownership before disposal without cancellation', async () => {
  const f = preparationFixture();
  let complete!: () => void, started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const inference = new Promise<void>((resolve) => {
    complete = resolve;
  });
  f.enhancer.withEnhancedRegion.mockImplementationOnce(async () => {
    started();
    await inference;
    return { applied: false, tileCount: 0 };
  });
  const input = { project: f.project, frame: f.frame, time: 1, media: f.media };
  const pending = f.owner.prepare(input);
  await entered;
  await expect(f.owner.prepare(input)).rejects.toThrow('busy');
  const failed = expect(pending).rejects.toThrow('disposed');
  const disposing = f.owner.dispose();
  expect(f.clones[0]!.close).not.toHaveBeenCalled();
  complete();
  await failed;
  await disposing;
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  expect(f.enhancer.dispose).toHaveBeenCalledOnce();
  await expect(f.owner.prepare(input)).rejects.toThrow('disposed');
});

it('normalizes mismatched raw display dimensions through the original source painter', async () => {
  const f = preparationFixture();
  f.source.toVideoFrame.mockImplementationOnce(() => {
    const clone = { displayWidth: 360, displayHeight: 640, timestamp: 1_000_000, close: vi.fn() };
    f.clones.push(clone);
    return clone as unknown as VideoFrame;
  });
  const pass = await f.owner.prepare({
    project: f.project,
    frame: f.frame,
    time: 1,
    media: f.media,
  });
  expect(f.source.draw).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 360);
  expect(f.enhancer.withEnhancedRegion.mock.calls[0]![0].source).toBe(f.canvases[0]);
  expect([f.canvases[0]!.width, f.canvases[0]!.height]).toEqual([640, 360]);
  pass.release();
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  expect(f.canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
  await f.owner.dispose();
});

it('returns a refused orientation surface and its source clone before a successful retry', async () => {
  const f = preparationFixture();
  Object.assign(f.source, { orientation: { rotation: 90, flip: false } });
  f.refuseContext.mockReturnValueOnce(true);
  const input = { project: f.project, frame: f.frame, time: 1, media: f.media };
  await expect(f.owner.prepare(input)).rejects.toThrow(
    'Original oriented source surface is unavailable'
  );
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  expect(f.enhancer.withEnhancedRegion).not.toHaveBeenCalled();
  expect([f.canvases[0]!.width, f.canvases[0]!.height]).toEqual([0, 0]);
  const pass = await f.owner.prepare(input);
  const source = pass.media.get(f.clip.id);
  if (!source || !('renderResources' in source) || !source.renderResources)
    throw Error('Missing resources');
  pass.release();
  const fullBudget = source.renderResources.bytes('recovered-budget', 128 * 1024 * 1024);
  fullBudget.release();
  expect(f.clones[1]!.close).toHaveBeenCalledOnce();
  await f.owner.dispose();
});

it.each(['missing', 'no-frame', 'width', 'height'] as const)(
  'refuses %s original sample data while releasing reader ownership',
  async (condition) => {
    const f = preparationFixture(),
      release = vi.fn();
    const { toVideoFrame: _toVideoFrame, ...withoutFrame } = f.source;
    const media = new Map<string, VideoCompositionFrameSource>();
    if (condition !== 'missing')
      media.set(
        f.clip.id,
        condition === 'no-frame'
          ? withoutFrame
          : {
              ...f.source,
              ...(condition === 'width' ? { sourceWidth: 320 } : { sourceHeight: 180 }),
            }
      );
    f.sample.mockResolvedValueOnce({
      media,
      bindings: new Map<string, never>(),
      forFrame: () => media,
      release,
    });
    await expect(
      f.owner.prepare({
        project: f.project,
        frame: f.frame,
        time: 1.1,
        sceneTime: 1,
        media: f.media,
      })
    ).rejects.toThrow(
      condition === 'width' || condition === 'height'
        ? 'display dimensions changed'
        : 'sample is unavailable'
    );
    expect(release).toHaveBeenCalledOnce();
    expect(f.clones).toHaveLength(0);
    expect(f.enhancer.withEnhancedRegion).not.toHaveBeenCalled();
    await f.owner.dispose();
  }
);

it('releases failed scratch allocation, explicit scratch leases and unreleased job resources', async () => {
  const f = preparationFixture();
  const pass = await f.owner.prepare({
    project: f.project,
    frame: f.frame,
    time: 1,
    media: f.media,
  });
  const source = pass.forDemand('outside-lens').get(f.clip.id);
  if (!source || !('renderResources' in source) || !source.renderResources)
    throw Error('Missing resources');
  const resources = source.renderResources;
  f.refuseContext.mockReturnValueOnce(true);
  expect(() => resources.canvas('refused', { width: 16, height: 16 })).toThrow(
    'scratch surface is unavailable'
  );
  expect(f.canvases.at(-1)).toMatchObject({ width: 0, height: 0 });
  const scratch = resources.canvas('scratch', { width: 16, height: 16 });
  scratch.release();
  scratch.release();
  expect([scratch.canvas.width, scratch.canvas.height]).toEqual([0, 0]);
  const bytes = resources.bytes('mask', 1024);
  bytes.release();
  bytes.release();
  const pendingScratch = resources.canvas('pending', { width: 8, height: 8 });
  resources.bytes('pending-mask', 1024);
  await f.owner.dispose();
  expect([pendingScratch.canvas.width, pendingScratch.canvas.height]).toEqual([0, 0]);
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
});
