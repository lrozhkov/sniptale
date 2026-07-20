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

function createCamera() {
  return {
    focusPoint: { x: 30, y: 20 },
    motionBlurAmount: 0.4,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: 'motion-1',
    scale: 1.5,
    viewportHeight: 30,
    viewportWidth: 60,
    viewportX: 10,
    viewportY: 5,
  };
}

function createFrameFixture() {
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

function configureLockedOverlayRenderPass(camera: ReturnType<typeof createCamera>) {
  const { visualLayers } = createFrameFixture();
  const overlayFrame = {
    actions: [],
    camera,
    cursor: null,
    visualLayers,
  };

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame,
    visualPasses: [
      {
        alpha: 1,
        frame: {
          ...overlayFrame,
        },
        time: 1.5,
        transitionOverlays: [],
      },
    ],
  });
  partitionVisualLayersByViewportLockMock.mockImplementation((layers, renderCamera) => ({
    locked: (layers as MockVisualLayer[]).filter((layer) =>
      shouldLockVisualLayerToViewportMock(layer, renderCamera)
    ),
    unlocked: (layers as MockVisualLayer[]).filter(
      (layer) => !shouldLockVisualLayerToViewportMock(layer, renderCamera)
    ),
  }));
  segmentVisualLayersByViewportLockMock.mockImplementation((layers, renderCamera) => [
    {
      isLocked: false,
      layers: (layers as MockVisualLayer[]).filter(
        (layer) => !shouldLockVisualLayerToViewportMock(layer, renderCamera)
      ),
    },
    {
      isLocked: true,
      layers: (layers as MockVisualLayer[]).filter((layer) =>
        shouldLockVisualLayerToViewportMock(layer, renderCamera)
      ),
    },
  ]);
  mapVisualLayerToViewportSpaceMock.mockImplementation((layer) => ({
    ...layer,
    x: 7.5,
    y: 30,
  }));
}

function expectLockedOverlayFrameDraw(context: CanvasRenderingContext2D) {
  expect(context.scale).toHaveBeenCalledWith(1.5, 1.5);
  expect(drawCompositionLayerMock).toHaveBeenNthCalledWith(
    1,
    context,
    expect.objectContaining({ clipId: 'clip-image', x: 0, y: 0 }),
    2,
    2,
    { asset: 'image' },
    expect.any(Map),
    1
  );
  expect(drawCompositionLayerMock).toHaveBeenNthCalledWith(
    2,
    context,
    expect.objectContaining({
      clipId: 'clip-text',
      height: 40,
      width: 120,
      x: 7.5,
      y: 30,
    }),
    2,
    2,
    { asset: 'image' },
    expect.any(Map),
    1
  );
}

it('draws locked overlay layers outside the camera scale path while keeping media camera-scaled', async () => {
  const { drawProjectFrame } = await import('./frame');
  const context = createContext();
  const camera = createCamera();
  const { project, settings } = createFrameFixture();

  configureLockedOverlayRenderPass(camera);
  drawProjectFrame(context, project, settings, 1.5, { asset: 'image' } as never, new Map());
  expectLockedOverlayFrameDraw(context);
});
