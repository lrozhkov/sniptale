// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  drawActionCompositionStateMock,
  drawCursorCompositionStateMock,
  mapCompositionPointThroughCameraMock,
  resolveVideoCompositionRenderPassesMock,
} = vi.hoisted(() => ({
  drawActionCompositionStateMock: vi.fn(),
  drawCursorCompositionStateMock: vi.fn(),
  mapCompositionPointThroughCameraMock: vi.fn(),
  resolveVideoCompositionRenderPassesMock: vi.fn(),
}));

vi.mock('../../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/composition/draw')>()),
  drawActionCompositionState: drawActionCompositionStateMock,
  drawCompositionVisualLayer: vi.fn(),
  drawCursorCompositionState: drawCursorCompositionStateMock,
}));

vi.mock('../../../../features/video/composition/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/composition/motion')>()),
  mapCompositionPointThroughCamera: mapCompositionPointThroughCameraMock,
}));

vi.mock('../../../../features/video/composition/motion/layer-camera', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/composition/motion/layer-camera')
  >()),
  mapVisualLayerToViewportSpace: vi.fn((layer) => layer),
  segmentVisualLayersByViewportLock: vi.fn((layers) => [{ isLocked: false, layers }]),
  shouldLockVisualLayerToViewport: vi.fn(() => false),
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
let originalDivGetBoundingClientRectDescriptor: PropertyDescriptor | undefined;

class ResizeObserverMock {
  disconnect() {
    return undefined;
  }
  observe() {
    return undefined;
  }
}

function createCanvasContextMock(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
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
  originalDivGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDivElement.prototype,
    'getBoundingClientRect'
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
    value: vi.fn(() => createCanvasContextMock()),
  });
  drawActionCompositionStateMock.mockReset();
  drawCursorCompositionStateMock.mockReset();
  mapCompositionPointThroughCameraMock.mockReset();
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
  restoreDescriptor(
    HTMLDivElement.prototype,
    'getBoundingClientRect',
    originalDivGetBoundingClientRectDescriptor
  );
  vi.unstubAllGlobals();
});

function restoreDescriptor(target: object, key: string, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

function createScaledCamera() {
  return {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    regionId: null,
    scale: 1.5,
    viewportHeight: 66.6667,
    viewportWidth: 133.3333,
    viewportX: 12,
    viewportY: 8,
  };
}

function installFullscreenStageRect() {
  Object.defineProperty(HTMLDivElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 220,
      bottom: 140,
      width: 220,
      height: 140,
      toJSON: () => ({}),
    }),
  });
}

function expectScaledOverlayCalls() {
  expect(drawCursorCompositionStateMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      scale: expect.closeTo(3.3, 8),
      x: expect.closeTo(39.6, 8),
      y: expect.closeTo(74.4, 8),
    })
  );
  expect(drawActionCompositionStateMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      point: { x: expect.closeTo(112.2, 8), y: expect.closeTo(150.3, 8) },
    }),
    { x: expect.closeTo(39.6, 8), y: expect.closeTo(74.4, 8) },
    expect.closeTo(1.65, 8)
  );
}

it(
  'centers overlay positions inside the fitted fullscreen viewport',
  verifyFullscreenViewportMapping
);
it(
  'scales screen-space overlays with the fitted viewport and active camera zoom',
  verifyOverlayScaleMapping
);

async function verifyFullscreenViewportMapping() {
  const camera = {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    regionId: null,
    scale: 1,
    viewportHeight: 100,
    viewportWidth: 200,
    viewportX: 0,
    viewportY: 0,
  };

  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: {
      actions: [],
      camera,
      cursor: { scale: 1, x: 60, y: 50 },
      visualLayers: [],
    },
    visualPasses: [{ alpha: 1, frame: { camera, visualLayers: [] }, time: 0 }],
  });
  mapCompositionPointThroughCameraMock.mockReturnValue({ x: 20, y: 50 });
  installFullscreenStageRect();

  await renderSceneHarness();

  expect(drawCursorCompositionStateMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      x: expect.closeTo(22, 8),
      y: 70,
    })
  );
}

async function verifyOverlayScaleMapping() {
  const camera = createScaledCamera();
  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: {
      actions: [{ point: { x: 80, y: 90 } }],
      camera,
      cursor: { scale: 2, x: 60, y: 50 },
      visualLayers: [],
    },
    visualPasses: [{ alpha: 1, frame: { camera, visualLayers: [] }, time: 0 }],
  });
  mapCompositionPointThroughCameraMock
    .mockReturnValueOnce({ x: 36, y: 54 })
    .mockReturnValueOnce({ x: 102, y: 123 });
  installFullscreenStageRect();
  await renderSceneHarness();
  expectScaledOverlayCalls();
}
