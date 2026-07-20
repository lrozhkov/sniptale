// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function createRenderPass() {
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

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  capturePrototypeDescriptors();
  installPrototypeMocks();
  drawActionCompositionStateMock.mockReset();
  drawCursorCompositionStateMock.mockReset();
  mapCompositionPointThroughCameraMock.mockReset();
  resolveVideoCompositionRenderPassesMock.mockReset();
});

function capturePrototypeDescriptors() {
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
}

function installPrototypeMocks() {
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
  Object.defineProperty(HTMLDivElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    }),
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  restorePrototypeDescriptor(
    HTMLCanvasElement.prototype,
    'clientHeight',
    originalCanvasClientHeightDescriptor
  );
  restorePrototypeDescriptor(
    HTMLCanvasElement.prototype,
    'clientWidth',
    originalCanvasClientWidthDescriptor
  );
  restorePrototypeDescriptor(
    HTMLCanvasElement.prototype,
    'getContext',
    originalCanvasGetContextDescriptor
  );
  restorePrototypeDescriptor(
    HTMLDivElement.prototype,
    'getBoundingClientRect',
    originalDivGetBoundingClientRectDescriptor
  );
  vi.unstubAllGlobals();
});

function restorePrototypeDescriptor(
  target: object,
  key: 'clientHeight' | 'clientWidth' | 'getBoundingClientRect' | 'getContext',
  descriptor?: PropertyDescriptor
) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

describe('preview-stage/scene-geometry', () => {
  it(
    'maps cursor and action overlays through the active camera before drawing',
    verifyCameraMappedOverlays
  );
});

async function verifyCameraMappedOverlays() {
  const renderPass = createRenderPass();

  mapCompositionPointThroughCameraMock.mockImplementation((point: { x: number; y: number }) => {
    if (point.x === 60) {
      return { x: 20, y: 50 };
    }
    return { x: 40, y: 70 };
  });
  resolveVideoCompositionRenderPassesMock.mockReturnValue({
    overlayFrame: {
      actions: [{ point: { x: 80, y: 90 } }],
      camera: renderPass.overlayFrame.camera,
      cursor: { scale: 1, x: 60, y: 50 },
      visualLayers: [],
    },
    visualPasses: [{ alpha: 1, frame: renderPass.overlayFrame, time: 0 }],
  });

  await renderSceneHarness();

  expect(mapCompositionPointThroughCameraMock).toHaveBeenNthCalledWith(
    1,
    { scale: 1, x: 60, y: 50 },
    expect.objectContaining({ viewportX: 0, viewportY: 0 })
  );
  expect(drawCursorCompositionStateMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ x: 20, y: 50 })
  );
  expect(drawActionCompositionStateMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      point: { x: 40, y: 70 },
    }),
    { x: 20, y: 50 },
    1
  );
}
