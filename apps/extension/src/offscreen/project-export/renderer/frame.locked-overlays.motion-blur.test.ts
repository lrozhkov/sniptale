import { afterEach, expect, it, vi } from 'vitest';
import { VideoMotionOverlayZoomMode } from '../../../features/video/project/types';

type MockVisualLayer = {
  clipId: string;
  height?: number;
  kind: 'image' | 'text';
  width?: number;
  x: number;
  y: number;
};

const {
  drawCompositionLayerMock,
  drawSceneBackgroundMock,
  getProjectSceneBackgroundMock,
  mapVisualLayerToViewportSpaceMock,
  partitionVisualLayersByViewportLockMock,
  resolveVideoCompositionRenderPassesMock,
  segmentVisualLayersByViewportLockMock,
  shouldLockVisualLayerToViewportMock,
} = vi.hoisted(() => ({
  drawCompositionLayerMock: vi.fn(),
  drawSceneBackgroundMock: vi.fn(),
  getProjectSceneBackgroundMock: vi.fn((project) => project.sceneBackground ?? { kind: 'solid' }),
  mapVisualLayerToViewportSpaceMock: vi.fn((layer) => layer),
  partitionVisualLayersByViewportLockMock: vi.fn(),
  resolveVideoCompositionRenderPassesMock: vi.fn(),
  segmentVisualLayersByViewportLockMock: vi.fn(),
  shouldLockVisualLayerToViewportMock: vi.fn(
    (layer, camera) =>
      camera.overlayZoomMode === VideoMotionOverlayZoomMode.LOCK_OVERLAYS && layer.kind === 'text'
  ),
}));

vi.mock('../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/draw')>()),
  drawActionCompositionState: vi.fn(),
  drawCursorCompositionState: vi.fn(),
  drawTransitionOverlay: vi.fn(),
}));

vi.mock('../../../features/video/composition/motion/layer-camera', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/video/composition/motion/layer-camera')
  >()),
  mapVisualLayerToViewportSpace: mapVisualLayerToViewportSpaceMock,
  partitionVisualLayersByViewportLock: partitionVisualLayersByViewportLockMock,
  segmentVisualLayersByViewportLock: segmentVisualLayersByViewportLockMock,
  shouldLockVisualLayerToViewport: shouldLockVisualLayerToViewportMock,
}));

vi.mock('../../../features/video/composition/timeline/render', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/timeline/render')>()),
  resolveVideoCompositionRenderPasses: resolveVideoCompositionRenderPassesMock,
}));

vi.mock('./clip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./clip')>()),
  drawCompositionLayer: drawCompositionLayerMock,
}));

vi.mock('../../../features/video/project/scene/background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/scene/background')>()),
  drawSceneBackground: drawSceneBackgroundMock,
  getProjectSceneBackground: getProjectSceneBackgroundMock,
}));
vi.mock('../../../features/video/project/scene/background-audio', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/video/project/scene/background-audio')
  >()),
  resolveSceneBackgroundAudioEnvelope: vi.fn(() => 0),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function createContext() {
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
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createCamera(scale: number, viewportX: number, viewportY: number) {
  return {
    focusPoint: { x: 30, y: 20 },
    motionBlurAmount: 0.4,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: 'motion-1',
    scale,
    viewportHeight: 30,
    viewportWidth: 60,
    viewportX,
    viewportY,
  };
}

function createFixture() {
  return {
    project: {
      backgroundColor: '#102030',
      height: 50,
      width: 100,
    } as never,
    settings: { height: 100, width: 200 } as never,
    visualLayers: [
      { clipId: 'clip-image', kind: 'image', x: 0, y: 0, width: 100, height: 50 },
      { clipId: 'clip-text', kind: 'text', x: 15, y: 25, width: 120, height: 40 },
    ] satisfies MockVisualLayer[],
  };
}

function createBufferContext() {
  return {
    ...createContext(),
    globalCompositeOperation: 'source-over',
    setTransform: vi.fn(),
  };
}

function stubOffscreenCanvas(bufferContext: ReturnType<typeof createBufferContext>) {
  class OffscreenCanvasMock {
    getContext = vi.fn(() => bufferContext);

    constructor(_width: number, _height: number) {}
  }

  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock as unknown as typeof OffscreenCanvas);
}

function configurePartitionMocks() {
  partitionVisualLayersByViewportLockMock.mockImplementation(
    (
      layers: MockVisualLayer[],
      renderCamera: { overlayZoomMode?: VideoMotionOverlayZoomMode }
    ) => ({
      locked: layers.filter((layer) => shouldLockVisualLayerToViewportMock(layer, renderCamera)),
      unlocked: layers.filter((layer) => !shouldLockVisualLayerToViewportMock(layer, renderCamera)),
    })
  );
  mapVisualLayerToViewportSpaceMock.mockImplementation((layer: MockVisualLayer) => ({
    ...layer,
    x: 7.5,
    y: 30,
  }));
  segmentVisualLayersByViewportLockMock.mockImplementation(
    (layers: MockVisualLayer[], renderCamera: { overlayZoomMode?: VideoMotionOverlayZoomMode }) => [
      {
        isLocked: false,
        layers: layers.filter((layer) => !shouldLockVisualLayerToViewportMock(layer, renderCamera)),
      },
      {
        isLocked: true,
        layers: layers.filter((layer) => shouldLockVisualLayerToViewportMock(layer, renderCamera)),
      },
    ]
  );
}

function configureMultiPassRenderPass(visualLayers: MockVisualLayer[]) {
  const overlayFrame = {
    actions: [],
    camera: createCamera(1.5, 10, 5),
    cursor: null,
    visualLayers,
  };

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame,
    visualPasses: [
      {
        alpha: 0.4,
        frame: {
          actions: [],
          camera: createCamera(1.3, 8, 4),
          cursor: null,
          visualLayers,
        },
        time: 1.45,
        transitionOverlays: [],
      },
      {
        alpha: 0.6,
        frame: overlayFrame,
        time: 1.5,
        transitionOverlays: [],
      },
    ],
  });
}

function expectLockedOverlayMotionBlurDraws(params: {
  bufferContext: ReturnType<typeof createBufferContext>;
  context: CanvasRenderingContext2D;
}) {
  expect(drawCompositionLayerMock).toHaveBeenCalledTimes(3);
  expect(drawCompositionLayerMock).toHaveBeenNthCalledWith(
    1,
    params.bufferContext,
    expect.objectContaining({ clipId: 'clip-image' }),
    2,
    2,
    { asset: 'image' },
    expect.any(Map),
    0.4
  );
  expect(drawCompositionLayerMock).toHaveBeenNthCalledWith(
    2,
    params.bufferContext,
    expect.objectContaining({ clipId: 'clip-image' }),
    2,
    2,
    { asset: 'image' },
    expect.any(Map),
    0.6
  );
  expect(drawCompositionLayerMock).toHaveBeenNthCalledWith(
    3,
    params.context,
    expect.objectContaining({ clipId: 'clip-text', x: 7.5, y: 30 }),
    2,
    2,
    { asset: 'image' },
    expect.any(Map),
    1
  );
}

it('draws locked text once while export media stays multi-pass during zoom blur', async () => {
  const { drawProjectFrame } = await import('./frame');
  const context = createContext();
  const bufferContext = createBufferContext();
  const { project, settings, visualLayers } = createFixture();

  stubOffscreenCanvas(bufferContext);
  configurePartitionMocks();
  configureMultiPassRenderPass(visualLayers);

  drawProjectFrame(context, project, settings, 1.5, { asset: 'image' } as never, new Map());

  expectLockedOverlayMotionBlurDraws({ bufferContext, context });
});
