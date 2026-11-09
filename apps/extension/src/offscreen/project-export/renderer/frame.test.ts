import { resolveVideoExportDimensions } from '../../../features/video/project/export/output-dimensions';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMotionOverlayZoomMode,
  VideoMp4Codec,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';
import type { LoadedImagesMap } from './types';
const {
  drawSceneActionCompositionStatesMock,
  drawCompositionLayerMock,
  drawCursorCompositionStateMock,
  drawExportSceneBackgroundMock,
  drawTransitionOverlayMock,
  resolveVideoCompositionRenderPassesMock,
  cameraSplitMock,
  cameraSplitPaintMock,
  deferredSpotlightMock,
  sharpStagesMock,
  drawFxMock,
  sceneSpotlightsMock,
  spatialDrawMock,
} = vi.hoisted(() => ({
  drawSceneActionCompositionStatesMock: vi.fn(),
  drawCompositionLayerMock: vi.fn(),
  drawCursorCompositionStateMock: vi.fn(),
  drawExportSceneBackgroundMock: vi.fn(),
  drawTransitionOverlayMock: vi.fn(),
  resolveVideoCompositionRenderPassesMock: vi.fn(),
  cameraSplitMock: vi.fn(() => null),
  cameraSplitPaintMock: vi.fn(),
  deferredSpotlightMock: vi.fn(),
  spatialDrawMock: vi.fn<
    typeof import('../../../features/video/composition/draw/spatial').drawSpatialCompositionGroup
  >(() => true),
  sharpStagesMock: vi.fn<typeof import('./source-sharp-stage').createNativeSharpStages>(() => []),
  drawFxMock: vi.fn<
    typeof import('../../../features/video/composition/draw').drawEffectRuntimeVisualLayer
  >(() => false),
  sceneSpotlightsMock:
    vi.fn<
      typeof import('../../../features/video/composition/draw/project-spotlight').drawCompositionSceneSpotlights
    >(),
}));

vi.mock('../../../features/video/composition/draw/spatial', () => ({
  drawSpatialCompositionGroup: spatialDrawMock,
  drawSpatialSceneOverlays: vi.fn(() => true),
}));
vi.mock('./source-sharp-stage', () => ({ createNativeSharpStages: sharpStagesMock }));
vi.mock('../../../features/video/composition/draw/project-spotlight', async (original) => ({
  ...(await original<
    typeof import('../../../features/video/composition/draw/project-spotlight')
  >()),
  drawCompositionSceneSpotlights: sceneSpotlightsMock,
}));

vi.mock('../../../features/video/composition/camera-split', () => ({
  resolveActiveCameraSplit: cameraSplitMock,
  paintCameraSplitScreen: cameraSplitPaintMock,
  drawDeferredCameraSplitSpotlights: deferredSpotlightMock,
}));

vi.mock('../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/draw')>()),
  drawSceneActionCompositionStates: drawSceneActionCompositionStatesMock,
  drawCursorCompositionState: drawCursorCompositionStateMock,
  drawTransitionOverlay: drawTransitionOverlayMock,
  drawEffectRuntimeVisualLayer: drawFxMock,
}));

vi.mock('../../../features/video/composition/motion/layer-camera', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/video/composition/motion/layer-camera')
  >()),
  mapVisualLayerToViewportSpace: vi.fn((layer) => layer),
  partitionVisualLayersByViewportLock: vi.fn((layers) => ({ locked: [], unlocked: layers })),
  segmentVisualLayersByViewportLock: vi.fn((layers) => [{ isLocked: false, layers }]),
  shouldLockVisualLayerToViewport: vi.fn(() => false),
}));

vi.mock('../../../features/video/composition/timeline/render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/timeline/render')>()),
  resolveVideoCompositionRenderPasses: resolveVideoCompositionRenderPassesMock,
}));

vi.mock('./clip', () => ({
  drawClip: vi.fn(),
  drawCompositionLayer: drawCompositionLayerMock,
}));

vi.mock('./background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./background')>()),
  drawExportSceneBackground: drawExportSceneBackgroundMock,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function createContext() {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('applies deferred camera spotlight masks after painting the split camera in export', async () => {
  const { drawProjectFrame } = await import('./frame');
  const context = createContext();
  const { frame, project } = createRenderedFrame();
  const camera = frame.visualLayers[0]!;
  const split = {
    clipId: camera.clipId,
    layer: camera,
    screen: { x: 0.51, y: 0, width: 0.49, height: 1 },
    camera: { x: 0, y: 0, width: 0.49, height: 1 },
  };
  cameraSplitMock.mockReturnValueOnce(split as never).mockReturnValueOnce(split as never);
  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [{ alpha: 1, frame, time: 0, transitionOverlays: [] }],
  });
  await drawProjectFrame(context, project, { width: 200, height: 100 } as never, 1, {}, new Map());
  expect(cameraSplitPaintMock).toHaveBeenCalledOnce();
  expect(deferredSpotlightMock).toHaveBeenCalledWith(expect.objectContaining({ context, split }));
  expect(drawCompositionLayerMock.mock.invocationCallOrder.at(-1)!).toBeLessThan(
    deferredSpotlightMock.mock.invocationCallOrder[0]!
  );
});

function createTransformTrackingContext() {
  let translationX = 0;
  const savedTranslations: number[] = [];
  const clipTranslations: number[] = [];
  const context = createContext();
  context.save = vi.fn(() => savedTranslations.push(translationX));
  context.restore = vi.fn(() => {
    translationX = savedTranslations.pop() ?? 0;
  });
  context.translate = vi.fn((x: number) => {
    translationX += x;
  });
  context.rect = vi.fn(() => clipTranslations.push(translationX));
  return { clipTranslations, context, readTranslationX: () => translationX };
}

function createRenderedFrame() {
  return {
    project: {
      backgroundColor: '#102030',
      height: 50,
      width: 100,
    } as never,
    settings: { height: 100, width: 200 } as never,
    frame: {
      actions: [
        {
          duration: 0.7,
          event: { preset: 'CLICK_RIPPLE' },
          point: { x: 20, y: 10 },
          progress: 0.5,
          start: 1,
        },
      ],
      camera: {
        focusPoint: { x: 30, y: 20 },
        motionBlurAmount: 0.4,
        overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
        regionId: 'motion-1',
        scale: 1.5,
        viewportHeight: 30,
        viewportWidth: 60,
        viewportX: 10,
        viewportY: 5,
      },
      cursor: {
        captureMode: 'separate',
        color: '#fff',
        scale: 1.2,
        shadow: true,
        visible: true,
        x: 12,
        y: 8,
      },
      visualLayers: [{ clipId: 'clip-1', kind: 'image' }],
    },
  };
}

function createExportSettings(
  project: { height: number; width: number },
  resolution: VideoResolutionPreset
): VideoProjectExportSettings {
  return {
    ...resolveVideoExportDimensions(project.width, project.height, resolution),
    downloadAfterExport: false,
    format: VideoExportFormat.MP4,
    fps: 30,
    mp4VideoCodec: VideoMp4Codec.AVC,
    quality: VideoExportQualityPreset.HIGH,
    resolution,
  };
}

it('applies camera transforms before rendering export layers and overlays', verifyFrameRendering);

it('contains a rounded standard output without stretching or cropping project coordinates', async () => {
  const { drawProjectFrame } = await import('./frame');
  const { clipTranslations, context, readTranslationX } = createTransformTrackingContext();
  const transitionTranslations: number[] = [];
  const { frame } = createRenderedFrame();
  const roundedProject = createEmptyVideoProject('Rounded output', 100, 51);
  const roundedSettings = createExportSettings(roundedProject, VideoResolutionPreset.P240);
  const loadedImages: LoadedImagesMap = {};

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [
      {
        alpha: 1,
        frame,
        time: 0,
        transitionOverlays: [
          {
            alpha: 1,
            color: '#000000',
            direction: 'LEFT',
            kind: 'fill',
            progress: 0.5,
            softness: 0,
            width: 1,
          },
        ],
      },
    ],
  });
  drawTransitionOverlayMock.mockImplementation(() => {
    transitionTranslations.push(readTranslationX());
  });

  await drawProjectFrame(context, roundedProject, roundedSettings, 0, loadedImages, new Map());

  const scale = Math.min(
    roundedSettings.width / roundedProject.width,
    roundedSettings.height / roundedProject.height
  );
  const offsetX = (roundedSettings.width - roundedProject.width * scale) / 2;
  expect(drawCompositionLayerMock).toHaveBeenCalledWith(
    context,
    frame.visualLayers[0],
    expect.closeTo(scale),
    expect.closeTo(scale),
    loadedImages,
    expect.any(Map),
    1
  );
  expect(context.translate).toHaveBeenNthCalledWith(
    1,
    expect.closeTo(offsetX),
    expect.closeTo((roundedSettings.height - roundedProject.height * scale) / 2)
  );
  expect(clipTranslations).toEqual([0]);
  expect(transitionTranslations).toEqual([0]);
});

it('crops only the odd Source encoder edge without a resampling transform', async () => {
  const { drawProjectFrame } = await import('./frame');
  const context = createContext();
  const { frame } = createRenderedFrame();
  const project = createEmptyVideoProject('Odd Source output', 1904, 985);
  const settings = createExportSettings(project, VideoResolutionPreset.SOURCE);
  const loadedImages: LoadedImagesMap = {};

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [{ alpha: 1, frame, time: 0, transitionOverlays: [] }],
  });

  await drawProjectFrame(context, project, settings, 0, loadedImages, new Map());

  expect(drawCompositionLayerMock).toHaveBeenCalledWith(
    context,
    frame.visualLayers[0],
    1,
    1,
    loadedImages,
    expect.any(Map),
    1
  );
  expect(context.translate).toHaveBeenNthCalledWith(1, -10, -5);
});

async function verifyFrameRendering() {
  const { drawProjectFrame } = await import('./frame');
  const context = createContext();
  const { frame, project, settings } = createRenderedFrame();

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [
      {
        alpha: 0.4,
        frame,
        time: 1.5,
        transitionOverlays: [
          {
            alpha: 0.5,
            color: '#f97316',
            direction: 'LEFT',
            kind: 'fill',
            progress: 0.5,
            softness: 0,
            width: 1,
          },
        ],
      },
    ],
  });

  await drawProjectFrame(context, project, settings, 1.5, { asset: 'image' } as never, new Map());

  expectFrameRenderingCalls(context, frame, project);
}

function expectFrameRenderingCalls(
  context: CanvasRenderingContext2D,
  frame: ReturnType<typeof createRenderedFrame>['frame'],
  project: ReturnType<typeof createRenderedFrame>['project']
) {
  expect(resolveVideoCompositionRenderPassesMock).toHaveBeenCalledWith(project, 1.5, {
    cameraViewport: { width: 200, height: 100 },
    includeSubtitles: false,
  });
  expect(drawExportSceneBackgroundMock).toHaveBeenCalledWith({
    context,
    currentTime: 1.5,
    height: 100,
    loadedImages: { asset: 'image' },
    project,
    width: 200,
  });
  expect(context.rect).toHaveBeenCalledWith(0, 0, 200, 100);
  expect(context.scale).toHaveBeenCalledWith(1.5, 1.5);
  expect(context.translate).toHaveBeenCalledWith(-20, -10);
  expect(drawCompositionLayerMock).toHaveBeenCalledWith(
    context,
    frame.visualLayers[0],
    2,
    2,
    { asset: 'image' },
    expect.any(Map),
    0.4
  );
  expect(drawSceneActionCompositionStatesMock).toHaveBeenCalledWith(
    context,
    frame.actions,
    frame.camera,
    { offsetX: 0, offsetY: 0, scaleX: 2, scaleY: 2 }
  );
  expect(drawCursorCompositionStateMock).toHaveBeenCalledWith(
    context,
    expect.objectContaining({ x: 6, y: 9 })
  );
  expect(drawTransitionOverlayMock).toHaveBeenCalledWith(
    context,
    expect.objectContaining({ color: '#f97316', kind: 'fill' }),
    200,
    100,
    0.4
  );
}

it('uses an accumulation buffer for multi-pass motion blur rendering', async () => {
  const { drawProjectFrame } = await import('./frame');
  const { frame, project, settings } = createRenderedFrame();
  const context = createContext();
  const bufferContext = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    globalCompositeOperation: 'source-over',
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  };
  class OffscreenCanvasMock {
    getContext = vi.fn(() => bufferContext);

    constructor(_width: number, _height: number) {}
  }

  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock as unknown as typeof OffscreenCanvas);

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [
      { alpha: 0.4, frame, time: 1.4, transitionOverlays: [] },
      { alpha: 0.6, frame, time: 1.5, transitionOverlays: [] },
    ],
  });

  await drawProjectFrame(context, project, settings, 1.5, { asset: 'image' } as never, new Map());

  expect(bufferContext.globalCompositeOperation).toBe('lighter');
  expect(context.drawImage).toHaveBeenCalledWith(expect.any(OffscreenCanvasMock), 0, 0, 200, 100);
});

it('skips cursor drawing when the composition frame has no cursor state', async () => {
  const { drawProjectFrame } = await import('./frame');

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: {
      actions: [],
      camera: {
        focusPoint: { x: 50, y: 25 },
        motionBlurAmount: 0,
        overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
        regionId: null,
        scale: 1,
        viewportHeight: 50,
        viewportWidth: 100,
        viewportX: 0,
        viewportY: 0,
      },
      cursor: null,
      visualLayers: [],
    },
    visualPasses: [],
  });

  await drawProjectFrame(
    createContext(),
    { backgroundColor: '#000', height: 50, width: 100 } as never,
    { height: 100, width: 200 } as never,
    0,
    {},
    new Map()
  );

  expect(drawSceneActionCompositionStatesMock).toHaveBeenCalledWith(
    expect.anything(),
    [],
    expect.anything(),
    expect.anything()
  );
  expect(drawCursorCompositionStateMock).not.toHaveBeenCalled();
});

it('passes the burn-in flag into composition rendering when subtitle export is enabled', async () => {
  const { drawProjectFrame } = await import('./frame');
  const { frame, project } = createRenderedFrame();

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [],
  });

  await drawProjectFrame(
    createContext(),
    project,
    { burnInSubtitles: true, height: 100, width: 200 } as never,
    2,
    {},
    new Map()
  );

  expect(resolveVideoCompositionRenderPassesMock).toHaveBeenCalledWith(project, 2, {
    cameraViewport: { width: 200, height: 100 },
    includeSubtitles: true,
  });
});

it.each([false, true])(
  'isolates sharp-stage FX state and releases retained stages after controlled draw failure=%s',
  async (failure) => {
    const { drawProjectFrame } = await import('./frame');
    const { createQuickEditSpotlight } =
      await import('../../../features/video/project/scene/focus-appearance');
    const { frame, project, settings } = createRenderedFrame();
    frame.visualLayers.push({ ...frame.visualLayers[0]!, clipId: 'clip-2' });
    const overlay = {
      ...frame,
      sceneSpotlights: [
        {
          id: 'boundary',
          afterClipId: 'clip-1',
          phase: 'hold',
          progress: 1,
          spotlight: createQuickEditSpotlight(),
        },
      ],
    };
    resolveVideoCompositionRenderPassesMock.mockReturnValue({
      overlayFrame: overlay,
      visualPasses: [{ alpha: 1, frame: overlay, time: 1 }],
    });
    const context = createContext(),
      sharpContext = { ...createContext(), setTransform: vi.fn() };
    const release = vi.fn(),
      releasePass = vi.fn();
    const stage = {
      id: 'sceneLens:global',
      context: sharpContext,
      output: { width: 20, height: 10 },
      transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      finished: false,
      paint: (paint: (ctx: CanvasRenderingContext2D) => void) =>
        paint(sharpContext as CanvasRenderingContext2D),
      publish: vi.fn(() => {
        stage.finished = true;
      }),
      dispose: release,
    };
    sharpStagesMock.mockReturnValueOnce([stage] as never);
    const media = new Map(),
      sampling = {
        prepare: vi.fn(async () => ({
          media,
          sourceRasterScale: 1,
          rasterScaleForDemand: () => 1,
          forDemand: () => media,
        })),
        releasePass,
      };
    const states: unknown[] = [],
      painted: unknown[] = [];
    drawFxMock.mockImplementation((args) => {
      const input = args as unknown as {
        context: unknown;
        state: { drawnTransitionIds: Set<string> };
      };
      states.push(input.state);
      if (!input.state.drawnTransitionIds.has('shared')) {
        input.state.drawnTransitionIds.add('shared');
        painted.push(input.context);
      }
      return true;
    });
    const gate = Promise.withResolvers<void>(),
      entered = Promise.withResolvers<void>();
    sampling.prepare.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise.then(() => ({
        media,
        sourceRasterScale: 1,
        rasterScaleForDemand: () => 1,
        forDemand: () => media,
      }));
    });
    sceneSpotlightsMock.mockImplementation((args) => {
      if (!args.afterClipId) args.sharpPaint?.('global', context);
    });
    const pending = drawProjectFrame(context, project, settings, 1, {}, media, {
      sourceSampling: sampling as unknown as NonNullable<
        NonNullable<Parameters<typeof drawProjectFrame>[6]>['sourceSampling']
      >,
    });
    await entered.promise;
    expect(release).not.toHaveBeenCalled();
    expect(stage.publish).not.toHaveBeenCalled();
    if (failure) gate.reject(new Error('sample failed'));
    else gate.resolve();
    if (failure) {
      await expect(pending).rejects.toThrow('sample failed');
      expect(stage.publish).not.toHaveBeenCalled();
    } else {
      await pending;
      expect(painted).toEqual([context, sharpContext]);
      expect(new Set(states).size).toBe(2);
      expect(stage.publish).toHaveBeenCalledOnce();
    }
    expect(release).toHaveBeenCalledOnce();
    expect(releasePass).toHaveBeenCalledOnce();
    drawFxMock.mockImplementation(() => false);
    sceneSpotlightsMock.mockReset();
  }
);
it('projects the body into its aperture while sharp stages retain their density', async () => {
  const { drawProjectFrame } = await import('./frame');
  const { frame } = createRenderedFrame();
  const project = createEmptyVideoProject('FHD selected', 1920, 1080),
    settings = createExportSettings(project, VideoResolutionPreset.SOURCE);
  const spatial = {
    ...frame,
    camera: {
      ...frame.camera,
      scale: 3,
      spatial: {
        rotation: [0, 0, 0, 1],
        perspective: 0,
        windowMotion: 0,
        lockBackground: false,
        focus: [],
        reference: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    },
  };
  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: spatial,
    visualPasses: [{ time: 1, alpha: 1, frame: spatial }],
  });
  const context = createContext(),
    sharp = { ...createContext(), setTransform: vi.fn() };
  const stage = {
    id: 'sceneLens:tiny',
    context: sharp,
    output: { width: 40, height: 30 },
    transform: [8, 0, 0, 0, 8, 0, 0, 0, 1],
    finished: false,
    paint: (paint: (ctx: CanvasRenderingContext2D) => void) =>
      paint(sharp as CanvasRenderingContext2D),
    dispose: vi.fn(),
    publish: vi.fn(),
  };
  sharpStagesMock.mockReturnValueOnce([stage] as never);
  const media = new Map(),
    sampling = {
      prepare: vi.fn(async () => ({
        media,
        sourceRasterScale: 3,
        rasterScaleForDemand: () => 24,
        forDemand: () => media,
      })),
      releasePass: vi.fn(),
    };
  await drawProjectFrame(context, project, settings, 1, {}, media, {
    sourceSampling: sampling as unknown as NonNullable<
      NonNullable<Parameters<typeof drawProjectFrame>[6]>['sourceSampling']
    >,
    spatialRenderer: () => ({}) as never,
  });
  const calls = spatialDrawMock.mock.calls.slice(-2).map((call) => call[0]);
  expect(calls[0]!.sourceRasterScale).toBe(3);
  expect(calls[0]!.sharpOutput!.output).toEqual({ width: 1920, height: 1080 });
  expect(calls[0]!.sharpOutput!.destination).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  expect(calls[1]!.sourceRasterScale).toBe(24);
  expect(calls[1]!.sharpOutput!.output).toEqual({ width: 40, height: 30 });
});

it.each([true, false])(
  'keeps locked overlay geometry while selecting each sharp source demand (prepared=%s)',
  async (enhanced) => {
    const { drawProjectFrame } = await import('./frame');
    const { segmentVisualLayersByViewportLock } =
      await import('../../../features/video/composition/motion/layer-camera');
    const { frame } = createRenderedFrame();
    const project = createEmptyVideoProject('Locked overlay sampling', 100, 50);
    const settings = createExportSettings(project, VideoResolutionPreset.SOURCE);
    const context = createContext(),
      sharpContext = { ...createContext(), setTransform: vi.fn() };
    const layer = frame.visualLayers[0]!;
    vi.mocked(segmentVisualLayersByViewportLock).mockReturnValueOnce([
      {
        isLocked: true,
        layers: [layer] as unknown as Parameters<typeof segmentVisualLayersByViewportLock>[0],
      },
    ]);
    resolveVideoCompositionRenderPassesMock.mockReturnValue({
      overlayFrame: frame,
      visualPasses: [{ time: 1, alpha: 1, frame, transitionOverlays: [] }],
    });
    const stage: import('./source-sharp-stage').NativeSharpStage = {
      id: 'sceneLens:active',
      finished: false,
      context: sharpContext,
      output: { width: 20, height: 10 },
      transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      paint: (paint: (target: CanvasRenderingContext2D) => void) => paint(sharpContext),
      publish: vi.fn(),
      dispose: vi.fn(),
    };
    const finished = {
      ...stage,
      id: 'sceneLens:finished',
      finished: true,
      paint: vi.fn(),
      dispose: vi.fn(),
    };
    if (enhanced) sharpStagesMock.mockReturnValueOnce([stage, finished]);
    const original = new Map(),
      ordinary = new Map([['ordinary', { sourceWidth: 100, sourceHeight: 50, draw() {} }]]),
      sharp = new Map([['sharp', { sourceWidth: 200, sourceHeight: 100, draw() {} }]]);
    const forDemand = vi.fn(() => sharp),
      releasePass = vi.fn(),
      prepare = vi.fn(async () => ({ media: ordinary, forDemand }));
    const signal = new AbortController().signal;
    await drawProjectFrame(
      context,
      project,
      settings,
      1,
      {},
      original,
      enhanced
        ? {
            sourceSampling: {
              prepare,
              releasePass,
            } as unknown as import('./source-sampling').ProjectExportSourceSampling,
            sourceSamplingFallback: 'first',
            signal,
          }
        : {}
    );
    const ordinaryCall = drawCompositionLayerMock.mock.calls.find(([target]) => target === context);
    const sharpCall = drawCompositionLayerMock.mock.calls.find(
      ([target]) => target === sharpContext
    );
    expect(ordinaryCall?.[1]).toBe(layer);
    if (enhanced) expect(sharpCall?.[1]).toBe(layer);
    expect(ordinaryCall?.[5]).toBe(enhanced ? ordinary : original);
    if (enhanced) expect(sharpCall?.[5]).toBe(sharp);
    expect(drawCompositionLayerMock).toHaveBeenCalledTimes(enhanced ? 2 : 1);
    if (enhanced) {
      expect(prepare).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          project,
          frame,
          time: 1,
          media: original,
          fallback: 'first',
          signal,
        })
      );
      expect(forDemand).toHaveBeenCalledExactlyOnceWith('sceneLens:active');
      expect(releasePass).toHaveBeenCalledOnce();
    } else expect(forDemand).not.toHaveBeenCalled();
    if (enhanced) {
      expect(stage.dispose).toHaveBeenCalledOnce();
      expect(finished.dispose).toHaveBeenCalledOnce();
    }
  }
);

it('releases locked-overlay sharp resources when source sampling fails before painting', async () => {
  const { drawProjectFrame } = await import('./frame');
  const { segmentVisualLayersByViewportLock } =
    await import('../../../features/video/composition/motion/layer-camera');
  const { frame } = createRenderedFrame();
  vi.mocked(segmentVisualLayersByViewportLock).mockReturnValueOnce([
    {
      isLocked: true,
      layers: frame.visualLayers as unknown as Parameters<
        typeof segmentVisualLayersByViewportLock
      >[0],
    },
  ]);
  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [{ time: 1, alpha: 1, frame, transitionOverlays: [] }],
  });
  const context = createContext();
  const stage: import('./source-sharp-stage').NativeSharpStage = {
    id: 'sceneLens:failed',
    finished: false,
    context,
    output: { width: 20, height: 10 },
    transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    paint: vi.fn(),
    publish: vi.fn(),
    dispose: vi.fn(),
  };
  sharpStagesMock.mockReturnValueOnce([stage]);
  const error = new Error('Enhanced source unavailable'),
    releasePass = vi.fn();
  const project = createEmptyVideoProject('Locked sampling failure', 100, 50);
  await expect(
    drawProjectFrame(
      context,
      project,
      createExportSettings(project, VideoResolutionPreset.SOURCE),
      1,
      {},
      new Map(),
      {
        sourceSampling: {
          prepare: vi.fn(async () => {
            throw error;
          }),
          releasePass,
        } as unknown as import('./source-sampling').ProjectExportSourceSampling,
      }
    )
  ).rejects.toBe(error);
  expect(drawCompositionLayerMock).not.toHaveBeenCalled();
  expect(stage.publish).not.toHaveBeenCalled();
  expect(stage.dispose).toHaveBeenCalledOnce();
  expect(releasePass).toHaveBeenCalledOnce();
  expect(context.restore).toHaveBeenCalledOnce();
});
