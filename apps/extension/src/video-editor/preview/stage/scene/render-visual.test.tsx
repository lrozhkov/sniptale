// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createEffectHostClip } from '../../../../features/video/project/factories/overlay-clip';
import type { ResolvedTransitionOverlay } from '../../../../features/video/project/transition/presentation';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../../../features/video/project/transition/presentation.types';
import { VideoTemplateDirection } from '../../../../features/video/project/types';
import type { VideoCompositionVisualLayer } from '../../../../features/video/composition/types';

const {
  drawCompositionVisualLayerMock,
  drawEffectRuntimeVisualLayerMock,
  drawTransitionOverlayMock,
} = vi.hoisted(() => ({
  drawCompositionVisualLayerMock: vi.fn(),
  drawEffectRuntimeVisualLayerMock: vi.fn(() => true),
  drawTransitionOverlayMock: vi.fn(),
}));

vi.mock('../../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/composition/draw')>()),
  drawCompositionVisualLayer: drawCompositionVisualLayerMock,
  drawEffectRuntimeVisualLayer: drawEffectRuntimeVisualLayerMock,
  drawTransitionOverlay: drawTransitionOverlayMock,
}));

vi.mock('../../../../features/video/composition/motion/layer-camera', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/composition/motion/layer-camera')
  >()),
  mapVisualLayerToViewportSpace: vi.fn((layer) => layer),
  partitionVisualLayersByViewportLock: vi.fn((layers) => ({ locked: [], unlocked: layers })),
  segmentVisualLayersByViewportLock: vi.fn((layers) => [{ isLocked: false, layers }]),
  shouldLockVisualLayerToViewport: vi.fn(() => false),
}));

vi.mock('../../../../features/video/project/scene/background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/project/scene/background')>()),
  drawSceneBackground: vi.fn(),
  getProjectSceneBackground: vi.fn(() => ({ kind: 'solid' })),
}));

vi.mock('../../../../features/video/project/scene/background-audio', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/project/scene/background-audio')
  >()),
  resolveSceneBackgroundAudioEnvelope: vi.fn(() => 0),
}));

import { drawSpatialCompositionGroup } from '../../../../features/video/composition/draw/spatial';
vi.mock('../../../../features/video/composition/draw/spatial', () => ({
  drawSpatialCompositionGroup: vi.fn(() => true),
}));
import { drawPreviewVisualPasses } from './render-visual';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createCanvasContext() {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  };
}

function createPreviewCanvas(context: ReturnType<typeof createCanvasContext>) {
  const canvas = document.createElement('canvas');

  Object.defineProperty(canvas, 'clientHeight', { configurable: true, get: () => 100 });
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  });

  return canvas;
}

function createPass(time: number, scale: number, viewportX: number, viewportY: number) {
  return {
    alpha: time < 1.5 ? 0.4 : 0.6,
    frame: {
      actions: [],
      camera: {
        focusPoint: { x: 100, y: 50 },
        motionBlurAmount: 0.6,
        overlayZoomMode: 'LOCK_OVERLAYS' as const,
        regionId: 'motion-1',
        scale,
        viewportHeight: 80,
        viewportWidth: 160,
        viewportX,
        viewportY,
      },
      cursor: null,
      effectInputLayers: [],
      effectRuntimePlans: [],
      visualLayers: [createEffectLayer()],
    },
    time,
    transitionOverlays: [] as ResolvedTransitionOverlay[],
  };
}

function createEffectLayer(): Extract<VideoCompositionVisualLayer, { kind: 'effect' }> {
  const clip = createEffectHostClip({
    duration: 2,
    effectInstanceId: 'effect-instance',
    name: 'Effect host',
    projectHeight: 100,
    projectWidth: 200,
    startTime: 0,
    trackId: 'overlay-track',
  });
  clip.id = 'effect-host';
  return {
    clip,
    clipId: clip.id,
    height: clip.transform.height,
    kind: 'effect',
    opacity: clip.transform.opacity,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
    rotation: clip.transform.rotation,
    width: clip.transform.width,
    x: clip.transform.x,
    y: clip.transform.y,
    zIndex: 0,
  };
}

function stubOffscreenCanvas(context: ReturnType<typeof createCanvasContext>) {
  class OffscreenCanvasMock {
    getContext = vi.fn(() => context);

    constructor(_width: number, _height: number) {}
  }

  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock as unknown as typeof OffscreenCanvas);
  return OffscreenCanvasMock;
}

function renderPreviewPasses(canvas: HTMLCanvasElement) {
  const firstPass = createPass(1.4, 1.2, 10, 5);
  firstPass.transitionOverlays = [
    {
      alpha: 1,
      color: '#ffffff',
      direction: VideoTemplateDirection.RIGHT,
      kind: 'fill',
      progress: 0.5,
      softness: 0,
      transitionId: 'transition-1',
      width: 1,
    },
  ];

  drawPreviewVisualPasses({
    canvas,
    clipMediaElements: new Map(),
    imageBank: {},
    overlayFrame: createPass(1.5, 1.25, 12, 7).frame,
    effectRuntimeFrames: {
      framesByTime: new Map([
        [1.4, new Map()],
        [1.5, new Map()],
      ]),
      overlayFrames: new Map(),
    },
    passes: [firstPass, createPass(1.5, 1.25, 12, 7)],
    project: {
      height: 100,
      sceneBackground: { kind: 'solid' },
      width: 200,
    } as never,
    stage: null,
  });
}

it('uses a weighted pass buffer for multi-pass preview rendering', () => {
  const canvasContext = createCanvasContext();
  const bufferContext = {
    ...createCanvasContext(),
    globalCompositeOperation: 'source-over',
  };
  const canvas = createPreviewCanvas(canvasContext);
  const offscreenCanvasClass = stubOffscreenCanvas(bufferContext);

  renderPreviewPasses(canvas);

  expect(bufferContext.globalCompositeOperation).toBe('lighter');
  expect(canvasContext.drawImage).toHaveBeenCalledWith(
    expect.any(offscreenCanvasClass),
    0,
    0,
    200,
    100
  );
  expect(drawEffectRuntimeVisualLayerMock).toHaveBeenCalled();
  expect(drawEffectRuntimeVisualLayerMock).toHaveBeenCalledBefore(drawTransitionOverlayMock);
});

it('dispatches a spatial preview pass at the real viewport raster without applying the affine camera again', () => {
  vi.mocked(drawSpatialCompositionGroup).mockClear();
  drawEffectRuntimeVisualLayerMock.mockClear();
  const context = createCanvasContext();
  const canvas = createPreviewCanvas(context);
  const base = createPass(1.5, 1.25, 12, 7);
  const spatial = {
    rotation: [0, 0, 0, 1] as const,
    perspective: 0.5,
    windowMotion: 1,
    lockBackground: true,
    focus: [],
    reference: { x: 0, y: 0, width: 200, height: 100 },
  };
  const pass = {
    ...base,
    alpha: 1,
    frame: { ...base.frame, camera: { ...base.frame.camera, spatial } },
  };
  const renderer = { validateSizes: vi.fn(), surface: vi.fn(), draw: vi.fn(), dispose: vi.fn() };
  const spatialRenderer = vi.fn(() => renderer);
  const project = { ...createEmptyVideoProject('Spatial preview', 200, 100) };
  const args = {
    canvas,
    clipMediaElements: new Map(),
    imageBank: {},
    overlayFrame: pass.frame,
    passes: [pass],
    project,
    stage: null,
    spatialRenderer,
  };
  drawPreviewVisualPasses(args);
  expect(spatialRenderer).toHaveBeenCalledOnce();
  expect(drawSpatialCompositionGroup).toHaveBeenCalledWith(
    expect.objectContaining({
      camera: pass.frame.camera,
      renderer,
      rasterScale: 1,
      output: { width: 200, height: 100 },
      destination: { x: 0, y: 0, width: 200, height: 100 },
    })
  );
  expect(context.scale).not.toHaveBeenCalled();
  expect(drawEffectRuntimeVisualLayerMock).not.toHaveBeenCalled();
  const { spatialRenderer: _factory, ...withoutRenderer } = args;
  expect(() => drawPreviewVisualPasses(withoutRenderer)).toThrow('Perspective renderer');
});

it('refuses spatial multi-pass rendering when an exposure buffer cannot be acquired', () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return null;
      }
    }
  );
  const context = createCanvasContext();
  const canvas = createPreviewCanvas(context);
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => 333 });
  const base = createPass(1.5, 1.25, 12, 7);
  const pass = {
    ...base,
    frame: {
      ...base.frame,
      camera: {
        ...base.frame.camera,
        spatial: {
          rotation: [0, 0, 0, 1] as const,
          perspective: 0.5,
          windowMotion: 1,
          lockBackground: true,
          focus: [],
          reference: { x: 0, y: 0, width: 200, height: 100 },
        },
      },
    },
  };
  vi.mocked(drawSpatialCompositionGroup).mockClear();
  expect(() =>
    drawPreviewVisualPasses({
      canvas,
      clipMediaElements: new Map(),
      imageBank: {},
      overlayFrame: pass.frame,
      passes: [pass, { ...pass, time: 1.6 }],
      project: createEmptyVideoProject('No exposure', 200, 100),
      stage: null,
    })
  ).toThrow('Motion blur buffer');
  expect(drawSpatialCompositionGroup).not.toHaveBeenCalled();
});
