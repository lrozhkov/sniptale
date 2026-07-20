// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMotionOverlayZoomMode } from '../../../../features/video/project/types';

const { drawCompositionVisualLayerMock, resolveVideoCompositionRenderPassesMock } = vi.hoisted(
  () => ({
    drawCompositionVisualLayerMock: vi.fn(),
    resolveVideoCompositionRenderPassesMock: vi.fn(),
  })
);

function isLockedAnnotationLayer(
  layer: { kind?: string },
  camera: { overlayZoomMode?: VideoMotionOverlayZoomMode }
) {
  return (
    camera.overlayZoomMode === VideoMotionOverlayZoomMode.LOCK_OVERLAYS &&
    layer.kind === 'annotation'
  );
}

vi.mock('../../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/composition/draw')>()),
  drawActionCompositionState: vi.fn(),
  drawCompositionVisualLayer: drawCompositionVisualLayerMock,
  drawCursorCompositionState: vi.fn(),
}));

vi.mock('../../../../features/video/composition/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/composition/motion')>()),
  mapCompositionPointThroughCamera: vi.fn((point: { x: number; y: number }) => point),
}));

vi.mock('../../../../features/video/composition/motion/layer-camera', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/composition/motion/layer-camera')
  >()),
  mapVisualLayerToViewportSpace: vi.fn((layer) => ({
    ...layer,
    x: 40,
    y: 30,
  })),
  mapCompositionPointThroughCamera: vi.fn((point: { x: number; y: number }) => point),
  partitionVisualLayersByViewportLock: vi.fn((layers, camera) => ({
    locked: (layers as Array<{ kind?: string }>).filter((layer) =>
      isLockedAnnotationLayer(layer, camera)
    ),
    unlocked: (layers as Array<{ kind?: string }>).filter(
      (layer) => !isLockedAnnotationLayer(layer, camera)
    ),
  })),
  segmentVisualLayersByViewportLock: vi.fn((layers, camera) => [
    {
      isLocked: false,
      layers: (layers as Array<{ kind?: string }>).filter(
        (layer) => !isLockedAnnotationLayer(layer, camera)
      ),
    },
    {
      isLocked: true,
      layers: (layers as Array<{ kind?: string }>).filter((layer) =>
        isLockedAnnotationLayer(layer, camera)
      ),
    },
  ]),
  shouldLockVisualLayerToViewport: vi.fn((layer, camera) => isLockedAnnotationLayer(layer, camera)),
}));

vi.mock('../../../../features/video/composition/timeline/render', () => ({
  resolveVideoCompositionRenderPasses: resolveVideoCompositionRenderPassesMock,
}));
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { usePreviewStageCanvasScene } from './index';
import { createPreviewEffectRuntimeFeedbackTestStub } from './test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalCanvasClientHeightDescriptor: PropertyDescriptor | undefined;
let originalCanvasClientWidthDescriptor: PropertyDescriptor | undefined;
let originalCanvasGetContextDescriptor: PropertyDescriptor | undefined;

class ResizeObserverMock {
  disconnect() {
    return undefined;
  }

  observe() {
    return undefined;
  }
}

function createRenderPass() {
  const camera = {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: null,
    scale: 1,
    viewportHeight: 100,
    viewportWidth: 200,
    viewportX: 0,
    viewportY: 0,
  };

  return {
    overlayFrame: {
      actions: [],
      camera,
      cursor: null,
      visualLayers: [],
    },
    visualPasses: [{ alpha: 1, frame: { camera, visualLayers: [] }, time: 0 }],
  };
}

function SceneHarness() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  usePreviewStageCanvasScene({
    activeClips: [],
    canvasRef,
    currentTime: 0,
    effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
    imageBank: {},
    project: createEmptyVideoProject('Scene', 200, 100),
    stageRef,
    videoRefs: { current: {} },
  });

  return (
    <div ref={stageRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}

async function renderSceneHarness() {
  await act(async () => root?.render(<SceneHarness />));
}

function restoreDescriptor(target: object, key: string, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  originalCanvasClientHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'clientHeight'
  );
  originalCanvasClientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'clientWidth'
  );
  originalCanvasGetContextDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'getContext'
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 100,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 200,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
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
    })),
  });
  drawCompositionVisualLayerMock.mockReset();
  resolveVideoCompositionRenderPassesMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  restoreDescriptor(
    HTMLCanvasElement.prototype,
    'clientHeight',
    originalCanvasClientHeightDescriptor
  );
  restoreDescriptor(
    HTMLCanvasElement.prototype,
    'clientWidth',
    originalCanvasClientWidthDescriptor
  );
  restoreDescriptor(HTMLCanvasElement.prototype, 'getContext', originalCanvasGetContextDescriptor);
  vi.unstubAllGlobals();
});

function createLockedVisualLayers() {
  return [
    { clipId: 'video-1', kind: 'video' },
    {
      clipId: 'annotation-1',
      kind: 'annotation',
      x: 120,
      y: 90,
      width: 240,
      height: 120,
    },
  ];
}

function setLockedAnnotationRenderPass() {
  const baseCamera = createRenderPass().overlayFrame.camera;
  const overlayFrame = {
    actions: [],
    camera: {
      ...baseCamera,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      scale: 1.6,
      viewportX: 20,
      viewportY: 10,
    },
    cursor: null,
    visualLayers: createLockedVisualLayers(),
  };
  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame,
    visualPasses: [
      {
        alpha: 1,
        frame: overlayFrame,
        time: 0,
        transitionOverlays: [],
      },
    ],
  });
}

function expectLockedAnnotationDraws() {
  expect(drawCompositionVisualLayerMock).toHaveBeenNthCalledWith(
    1,
    expect.anything(),
    expect.objectContaining({ clipId: 'video-1' }),
    1,
    1,
    {},
    expect.any(Map),
    1
  );
  expect(drawCompositionVisualLayerMock).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    expect.objectContaining({
      clipId: 'annotation-1',
      height: 120,
      width: 240,
      x: 40,
      y: 30,
    }),
    1,
    1,
    {},
    expect.any(Map),
    1
  );
}

it('renders locked annotation overlays outside the camera scale path', async () => {
  setLockedAnnotationRenderPass();
  await renderSceneHarness();
  expectLockedAnnotationDraws();
});
