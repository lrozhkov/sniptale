// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { drawCompositionVisualLayerMock, resolveVideoCompositionRenderPassesMock } = vi.hoisted(
  () => ({
    drawCompositionVisualLayerMock: vi.fn(),
    resolveVideoCompositionRenderPassesMock: vi.fn(),
  })
);

vi.mock('../../../../features/video/composition/draw', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../features/video/composition/draw')>();
  return {
    ...actual,
    drawActionCompositionState: vi.fn(),
    drawCompositionVisualLayer: drawCompositionVisualLayerMock,
    drawCursorCompositionState: vi.fn(),
  };
});

vi.mock('../../../../features/video/composition/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/composition/motion')>()),
  mapCompositionPointThroughCamera: vi.fn((point: { x: number; y: number }) => point),
}));

vi.mock('../../../../features/video/composition/motion/layer-camera', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../features/video/composition/motion/layer-camera')
    >();
  return {
    ...actual,
    mapVisualLayerToViewportSpace: vi.fn((layer) => layer),
    partitionVisualLayersByViewportLock: vi.fn((layers) => ({ locked: [], unlocked: layers })),
    segmentVisualLayersByViewportLock: vi.fn((layers) => [{ isLocked: false, layers }]),
    shouldLockVisualLayerToViewport: vi.fn(() => false),
  };
});

vi.mock('../../../../features/video/composition/timeline/render', () => ({
  resolveVideoCompositionRenderPasses: resolveVideoCompositionRenderPassesMock,
}));
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { usePreviewStageCanvasScene } from './index';
import { createPreviewEffectRuntimeFeedbackTestStub } from './test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let canvasContextMock: ReturnType<typeof createCanvasContextMock> | null = null;
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

function createCanvasContextMock(): {
  beginPath: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  globalCompositeOperation?: string;
  rect: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
} {
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

function SceneHarness(props: {
  currentTime: number;
  project: ReturnType<typeof createEmptyVideoProject>;
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement | null>>;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  usePreviewStageCanvasScene({
    activeClips: [],
    canvasRef,
    currentTime: props.currentTime,
    effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
    imageBank: {},
    project: props.project,
    stageRef,
    videoRefs: props.videoRefs,
  });

  return (
    <div ref={stageRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}

async function renderSceneHarness(
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement | null>> = { current: {} }
) {
  await act(async () => {
    root?.render(
      <SceneHarness
        currentTime={0}
        project={createEmptyVideoProject('Scene', 200, 100)}
        videoRefs={videoRefs}
      />
    );
  });
}

function installCanvasDimensions() {
  originalCanvasClientHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'clientHeight'
  );
  originalCanvasClientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'clientWidth'
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 100,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 200,
  });
}

function installCanvasContextMock() {
  originalCanvasGetContextDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'getContext'
  );
  canvasContextMock = createCanvasContextMock();
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => canvasContextMock),
  });
}

function restoreCanvasEnvironment() {
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
}

function installSceneHarnessEnvironment() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    })
  );
  installCanvasDimensions();
  installCanvasContextMock();
  resolveVideoCompositionRenderPassesMock.mockReset();
  drawCompositionVisualLayerMock.mockReset();
  resolveVideoCompositionRenderPassesMock.mockReturnValue(createRenderPass());
}

beforeEach(() => {
  installSceneHarnessEnvironment();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  canvasContextMock = null;
  restoreCanvasEnvironment();
  vi.unstubAllGlobals();
});

function restoreDescriptor(target: object, key: string, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }

  Reflect.deleteProperty(target, key);
}

describe('preview-stage/scene', () => {
  it('rerenders the paused preview canvas when a synced video dispatches seeked', async () => {
    const video = document.createElement('video');

    await renderSceneHarness({ current: { 'clip-1': video } });
    const initialCallCount = resolveVideoCompositionRenderPassesMock.mock.calls.length;

    await act(async () => {
      video.dispatchEvent(new Event('seeked'));
    });

    expect(resolveVideoCompositionRenderPassesMock.mock.calls.length).toBeGreaterThan(
      initialCallCount
    );
  });

  it('uses an accumulation buffer for multi-pass zoom rendering', async () => {
    const camera = createRenderPass().overlayFrame.camera;
    const bufferContext = createCanvasContextMock();
    class OffscreenCanvasMock {
      getContext = vi.fn(() => bufferContext);

      constructor(_width: number, _height: number) {}
    }

    vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock as unknown as typeof OffscreenCanvas);
    resolveVideoCompositionRenderPassesMock.mockReturnValue({
      overlayFrame: { actions: [], camera, cursor: null, visualLayers: [] },
      visualPasses: [
        { alpha: 0.4, frame: { camera, visualLayers: [] }, time: 0 },
        { alpha: 0.6, frame: { camera, visualLayers: [] }, time: 0.04 },
      ],
    });

    await renderSceneHarness();

    expect(bufferContext.globalCompositeOperation).toBe('lighter');
    expect(canvasContextMock?.drawImage).toHaveBeenCalledWith(
      expect.any(OffscreenCanvasMock),
      0,
      0,
      200,
      100
    );
  });
});
