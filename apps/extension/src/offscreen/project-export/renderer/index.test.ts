import { afterEach, expect, it, vi } from 'vitest';

const {
  drawActionCompositionStateMock,
  drawCompositionLayerMock,
  drawCursorCompositionStateMock,
  resolveVideoCompositionRenderPassesMock,
} = vi.hoisted(() => ({
  drawActionCompositionStateMock: vi.fn(),
  drawCompositionLayerMock: vi.fn(),
  drawCursorCompositionStateMock: vi.fn(),
  resolveVideoCompositionRenderPassesMock: vi.fn(),
}));

vi.mock('../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/draw')>()),
  drawActionCompositionState: drawActionCompositionStateMock,
  drawCursorCompositionState: drawCursorCompositionStateMock,
}));

vi.mock('../../../features/video/composition/motion/layer-camera', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/video/composition/motion/layer-camera')
  >()),
  mapVisualLayerToViewportSpace: vi.fn((layer) => layer),
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

afterEach(() => {
  vi.clearAllMocks();
});

function createContext() {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

async function importDrawProjectFrame() {
  return (await import('./index')).drawProjectFrame;
}

function createRenderedFrame() {
  return {
    project: {
      width: 100,
      height: 50,
      backgroundColor: '#102030',
    } as never,
    settings: { width: 200, height: 100 } as never,
    frame: {
      camera: {
        focusPoint: { x: 50, y: 25 },
        motionBlurAmount: 0,
        regionId: null,
        scale: 1,
        viewportHeight: 50,
        viewportWidth: 100,
        viewportX: 0,
        viewportY: 0,
      },
      visualLayers: [{ clipId: 'clip-1', kind: 'image' }],
      cursor: {
        captureMode: 'separate',
        color: '#fff',
        scale: 1.2,
        shadow: true,
        visible: true,
        x: 12,
        y: 8,
      },
      actions: [
        {
          duration: 0.7,
          event: { preset: 'CLICK_RIPPLE' },
          point: { x: 20, y: 10 },
          progress: 0.5,
          start: 1,
        },
        {
          duration: 1.3,
          event: { preset: 'SPOTLIGHT' },
          point: null,
          progress: 0.25,
          start: 1,
        },
      ],
    },
  };
}

function expectScaledOverlayDraws(
  context: CanvasRenderingContext2D,
  frame: ReturnType<typeof createRenderedFrame>['frame']
) {
  expect(drawCompositionLayerMock).toHaveBeenCalledWith(
    context,
    frame.visualLayers[0],
    2,
    2,
    { asset: 'image' },
    expect.any(Map),
    1
  );
  expect(drawActionCompositionStateMock).toHaveBeenNthCalledWith(
    1,
    context,
    expect.objectContaining({ point: { x: 40, y: 20 } }),
    { x: 24, y: 16 }
  );
  expect(drawActionCompositionStateMock).toHaveBeenNthCalledWith(
    2,
    context,
    expect.objectContaining({ point: null }),
    { x: 24, y: 16 }
  );
  expect(drawCursorCompositionStateMock).toHaveBeenCalledWith(
    context,
    expect.objectContaining({ x: 24, y: 16 })
  );
}

it('renders composition layers and scales cursor and action overlays through the frame seam', async () => {
  const drawProjectFrame = await importDrawProjectFrame();
  const context = createContext();
  const { frame, project, settings } = createRenderedFrame();

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: frame,
    visualPasses: [{ alpha: 1, frame, time: 1.5 }],
  });

  drawProjectFrame(context, project, settings, 1.5, { asset: 'image' } as never, new Map());

  expect(resolveVideoCompositionRenderPassesMock).toHaveBeenCalledWith(project, 1.5, {
    includeSubtitles: false,
  });
  expect(context.clearRect).toHaveBeenCalledWith(0, 0, 200, 100);
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
  expectScaledOverlayDraws(context, frame);
});

it('skips cursor drawing when the composition frame does not expose cursor state', async () => {
  const drawProjectFrame = await importDrawProjectFrame();

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: {
      actions: [],
      camera: {
        focusPoint: { x: 50, y: 25 },
        motionBlurAmount: 0,
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
    {
      height: 100,
      width: 200,
    } as never,
    0,
    {},
    new Map()
  );

  expect(drawActionCompositionStateMock).not.toHaveBeenCalled();
  expect(drawCursorCompositionStateMock).not.toHaveBeenCalled();
});
