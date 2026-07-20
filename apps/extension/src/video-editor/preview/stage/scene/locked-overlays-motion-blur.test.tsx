// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { VideoMotionOverlayZoomMode } from '../../../../features/video/project/types';

const { drawCompositionVisualLayerMock } = vi.hoisted(() => ({
  drawCompositionVisualLayerMock: vi.fn(),
}));

type MockVisualLayer = {
  clipId: string;
  height?: number;
  kind: 'annotation' | 'video';
  width?: number;
  x?: number;
  y?: number;
};

function isLockedAnnotationLayer(
  layer: MockVisualLayer,
  camera: { overlayZoomMode?: VideoMotionOverlayZoomMode }
) {
  return (
    camera.overlayZoomMode === VideoMotionOverlayZoomMode.LOCK_OVERLAYS &&
    layer.kind === 'annotation'
  );
}

vi.mock('../../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/composition/draw')>()),
  drawCompositionVisualLayer: drawCompositionVisualLayerMock,
  drawTransitionOverlay: vi.fn(),
}));

vi.mock('../../../../features/video/composition/motion/layer-camera', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/composition/motion/layer-camera')
  >()),
  mapVisualLayerToViewportSpace: vi.fn((layer: MockVisualLayer) => ({
    ...layer,
    x: 40,
    y: 30,
  })),
  partitionVisualLayersByViewportLock: vi.fn(
    (layers: MockVisualLayer[], camera: { overlayZoomMode?: VideoMotionOverlayZoomMode }) => ({
      locked: layers.filter((layer) => isLockedAnnotationLayer(layer, camera)),
      unlocked: layers.filter((layer) => !isLockedAnnotationLayer(layer, camera)),
    })
  ),
  segmentVisualLayersByViewportLock: vi.fn(
    (layers: MockVisualLayer[], camera: { overlayZoomMode?: VideoMotionOverlayZoomMode }) => [
      {
        isLocked: false,
        layers: layers.filter((layer) => !isLockedAnnotationLayer(layer, camera)),
      },
      {
        isLocked: true,
        layers: layers.filter((layer) => isLockedAnnotationLayer(layer, camera)),
      },
    ]
  ),
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
    fillRect: vi.fn(),
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

function createCamera(scale: number, viewportX: number, viewportY: number) {
  return {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0.6,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: 'motion-1',
    scale,
    viewportHeight: 80,
    viewportWidth: 160,
    viewportX,
    viewportY,
  };
}

function createVisualLayers(): MockVisualLayer[] {
  return [
    { clipId: 'video-1', kind: 'video' },
    {
      clipId: 'annotation-1',
      height: 120,
      kind: 'annotation',
      width: 240,
      x: 120,
      y: 90,
    },
  ];
}

function createBufferContext() {
  return {
    ...createCanvasContext(),
    globalCompositeOperation: 'source-over',
  };
}

function stubOffscreenCanvas(bufferContext: ReturnType<typeof createBufferContext>) {
  class OffscreenCanvasMock {
    getContext = vi.fn(() => bufferContext);

    constructor(_width: number, _height: number) {}
  }

  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock as unknown as typeof OffscreenCanvas);
  return OffscreenCanvasMock;
}

function createOverlayFrame() {
  return {
    actions: [],
    camera: createCamera(1.6, 20, 10),
    cursor: null,
    visualLayers: createVisualLayers(),
  };
}

function createPreviewPasses() {
  const overlayFrame = createOverlayFrame();

  return {
    overlayFrame,
    passes: [
      {
        alpha: 0.4,
        frame: {
          actions: [],
          camera: createCamera(1.4, 12, 6),
          cursor: null,
          visualLayers: createVisualLayers(),
        } as never,
        time: 0.48,
        transitionOverlays: [],
      },
      {
        alpha: 0.6,
        frame: overlayFrame as never,
        time: 0.5,
        transitionOverlays: [],
      },
    ],
  };
}

function expectMultiPassLockedOverlayDraws(params: {
  bufferContext: ReturnType<typeof createBufferContext>;
  canvasContext: ReturnType<typeof createCanvasContext>;
}) {
  expect(drawCompositionVisualLayerMock).toHaveBeenCalledTimes(3);
  expect(drawCompositionVisualLayerMock).toHaveBeenNthCalledWith(
    1,
    params.bufferContext,
    expect.objectContaining({ clipId: 'video-1' }),
    1,
    1,
    {},
    expect.any(Map),
    0.4
  );
  expect(drawCompositionVisualLayerMock).toHaveBeenNthCalledWith(
    2,
    params.bufferContext,
    expect.objectContaining({ clipId: 'video-1' }),
    1,
    1,
    {},
    expect.any(Map),
    0.6
  );
  expect(drawCompositionVisualLayerMock).toHaveBeenNthCalledWith(
    3,
    params.canvasContext,
    expect.objectContaining({ clipId: 'annotation-1', x: 40, y: 30 }),
    1,
    1,
    {},
    expect.any(Map),
    1
  );
}

it('draws locked annotation overlays once while media stays in the preview blur buffer', () => {
  const canvasContext = createCanvasContext();
  const bufferContext = createBufferContext();
  const { overlayFrame, passes } = createPreviewPasses();

  stubOffscreenCanvas(bufferContext);

  drawPreviewVisualPasses({
    canvas: createPreviewCanvas(canvasContext),
    clipMediaElements: new Map(),
    imageBank: {},
    overlayFrame: overlayFrame as never,
    passes: passes as never,
    project: { height: 100, sceneBackground: { kind: 'solid' }, width: 200 } as never,
    stage: null,
  });

  expectMultiPassLockedOverlayDraws({ bufferContext, canvasContext });
});
