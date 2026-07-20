import { afterEach, expect, it, vi } from 'vitest';
import { VideoMotionOverlayZoomMode } from '../../../features/video/project/types';
const {
  drawActionCompositionStateMock,
  drawCompositionLayerMock,
  drawCursorCompositionStateMock,
  drawExportSceneBackgroundMock,
  drawTransitionOverlayMock,
  resolveVideoCompositionRenderPassesMock,
} = vi.hoisted(() => ({
  drawActionCompositionStateMock: vi.fn(),
  drawCompositionLayerMock: vi.fn(),
  drawCursorCompositionStateMock: vi.fn(),
  drawExportSceneBackgroundMock: vi.fn(),
  drawTransitionOverlayMock: vi.fn(),
  resolveVideoCompositionRenderPassesMock: vi.fn(),
}));

vi.mock('../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/draw')>()),
  drawActionCompositionState: drawActionCompositionStateMock,
  drawCursorCompositionState: drawCursorCompositionStateMock,
  drawTransitionOverlay: drawTransitionOverlayMock,
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

it('applies camera transforms before rendering export layers and overlays', verifyFrameRendering);

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

  drawProjectFrame(context, project, settings, 1.5, { asset: 'image' } as never, new Map());

  expectFrameRenderingCalls(context, frame, project);
}

function expectFrameRenderingCalls(
  context: CanvasRenderingContext2D,
  frame: ReturnType<typeof createRenderedFrame>['frame'],
  project: ReturnType<typeof createRenderedFrame>['project']
) {
  expect(resolveVideoCompositionRenderPassesMock).toHaveBeenCalledWith(project, 1.5, {
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
  expect(drawActionCompositionStateMock).toHaveBeenCalledWith(
    context,
    expect.objectContaining({ point: { x: 40, y: 20 } }),
    { x: 24, y: 16 }
  );
  expect(drawCursorCompositionStateMock).toHaveBeenCalledWith(
    context,
    expect.objectContaining({ x: 24, y: 16 })
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

  drawProjectFrame(context, project, settings, 1.5, { asset: 'image' } as never, new Map());

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

  drawProjectFrame(
    createContext(),
    { backgroundColor: '#000', height: 50, width: 100 } as never,
    { height: 100, width: 200 } as never,
    0,
    {},
    new Map()
  );

  expect(drawActionCompositionStateMock).not.toHaveBeenCalled();
  expect(drawCursorCompositionStateMock).not.toHaveBeenCalled();
});

it('passes the burn-in flag into composition rendering when subtitle export is enabled', async () => {
  const { drawProjectFrame } = await import('./frame');
  const { frame, project } = createRenderedFrame();

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [],
  });

  drawProjectFrame(
    createContext(),
    project,
    { burnInSubtitles: true, height: 100, width: 200 } as never,
    2,
    {},
    new Map()
  );

  expect(resolveVideoCompositionRenderPassesMock).toHaveBeenCalledWith(project, 2, {
    includeSubtitles: true,
  });
});
