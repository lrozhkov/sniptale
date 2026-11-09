// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';

const { drawSceneBackgroundMock, getProjectSceneBackgroundMock } = vi.hoisted(() => ({
  drawSceneBackgroundMock: vi.fn(),
  getProjectSceneBackgroundMock: vi.fn(() => ({ kind: 'solid' })),
}));

vi.mock('../../../../features/video/project/scene/background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/project/scene/background')>()),
  drawSceneBackground: drawSceneBackgroundMock,
  getProjectSceneBackground: getProjectSceneBackgroundMock,
}));

vi.mock('../../../../features/video/project/scene/background-audio', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/video/project/scene/background-audio')
  >()),
  resolveSceneBackgroundAudioEnvelope: vi.fn(() => 0),
}));

import {
  beginPreviewCameraPass,
  resolvePreparedPreviewSceneCanvas,
  resolvePreviewSceneCanvasLayout,
  resolvePreviewEffectRuntimeRasterScale,
} from './canvas';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createContextMock() {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('prepares the preview canvas and redraws the scene background', () => {
  const context = createContextMock();
  const canvas = document.createElement('canvas');

  Object.defineProperty(canvas, 'clientHeight', { configurable: true, get: () => 100 });
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(canvas, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  });

  const prepared = resolvePreparedPreviewSceneCanvas({
    canvas,
    imageBank: {},
    project: {
      ...createEmptyVideoProject('Preview canvas', 200, 100),
      sceneBackground: { color: '#000000', kind: 'solid' },
    },
    shouldClearCanvas: true,
    stage: null,
  });

  expect(prepared).not.toBeNull();
  expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  expect(drawSceneBackgroundMock).toHaveBeenCalledWith({
    projectScale: 1,
    audioEnvelope: 0,
    context,
    currentTime: 0,
    height: 100,
    loadedImages: {},
    sceneBackground: { kind: 'solid' },
    width: 200,
  });
});

it('begins a clipped camera pass inside the prepared viewport', () => {
  const context = createContextMock();

  beginPreviewCameraPass(
    {
      bounds: { height: 120, width: 220 },
      context,
      dpr: 1,
      viewport: {
        height: 100,
        offsetX: 10,
        offsetY: 8,
        scale: 2,
        width: 200,
      },
    },
    { scale: 1.5, viewportX: 12, viewportY: 6 }
  );

  expect(context.rect).toHaveBeenCalledWith(10, 8, 200, 100);
  expect(context.translate).toHaveBeenCalledWith(10, 8);
  expect(context.scale).toHaveBeenCalledWith(1.5, 1.5);
  expect(context.translate).toHaveBeenCalledWith(-24, -12);
});

it('caps EffectV1 preview raster to the physical viewport while retaining logical geometry', () => {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, get: () => 540 });
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => 960 });

  expect(
    resolvePreviewEffectRuntimeRasterScale({
      canvas,
      project: createEmptyVideoProject('Effect raster', 3840, 2160),
      stage: null,
    })
  ).toBe(0.25);
});

it.each([false, true])('converts background pixels before DPR with camera=%s', (moving) => {
  const project = createEmptyVideoProject('Preview blur');
  project.width = 640;
  project.height = 360;
  project.sceneBackground = { kind: 'solid', color: '#123456', blur: 12 };
  const context = { setTransform: vi.fn(), clearRect: vi.fn() };
  const canvas = {
    clientWidth: 320,
    clientHeight: 180,
    width: 640,
    height: 360,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  const camera = { scale: 2, viewportX: 40, viewportY: 30 };
  const prepared = resolvePreparedPreviewSceneCanvas({
    ...(moving ? { backgroundCamera: camera } : {}),
    canvas,
    project,
    imageBank: {},
    stage: null,
    shouldClearCanvas: true,
    previewRasterSize: { width: 640, height: 360 },
  });
  expect(prepared?.dpr).toBe(2);
  expect(drawSceneBackgroundMock).toHaveBeenCalledWith(
    expect.objectContaining({
      width: 320,
      height: 180,
      ...(moving ? { camera } : {}),
      projectScale: 0.5,
      sceneBackground: { kind: 'solid' },
    })
  );
  expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
});

it('sizes a detached drawing canvas from the presented viewport without resizing the presented canvas', () => {
  const canvas = document.createElement('canvas');
  const viewportCanvas = document.createElement('canvas');
  viewportCanvas.width = 320;
  viewportCanvas.height = 180;
  Object.defineProperty(viewportCanvas, 'clientWidth', { get: () => 960 });
  Object.defineProperty(viewportCanvas, 'clientHeight', { get: () => 540 });
  const context = createContextMock();
  Object.defineProperty(canvas, 'getContext', { value: () => context });
  const args = {
    canvas,
    viewportCanvas,
    imageBank: {},
    project: createEmptyVideoProject('Detached', 1280, 720),
    shouldClearCanvas: true,
    stage: null,
    previewRasterSize: { width: 480, height: 270 },
  };
  const prepared = resolvePreparedPreviewSceneCanvas(args)!;
  expect(prepared.bounds).toEqual({ width: 960, height: 540 });
  expect(prepared.viewport.scale).toBe(0.75);
  expect(prepared.dpr).toBe(0.5);
  expect(canvas.width).toBe(480);
  expect(canvas.height).toBe(270);
  expect(viewportCanvas.width).toBe(320);
  expect(viewportCanvas.height).toBe(180);
});

function layoutFixture(width: number, height: number) {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, get: () => height });
  const context = createContextMock();
  const getContext = vi.fn(() => context);
  Object.defineProperty(canvas, 'getContext', { value: getContext });
  return { canvas, context, getContext };
}

it.each([undefined, { width: 1280, height: 720 }])(
  'measures letterbox layout without binding2D or changing backing: %j',
  (previewRasterSize) => {
    const f = layoutFixture(200, 200);
    const width = vi.spyOn(f.canvas, 'width', 'set');
    const height = vi.spyOn(f.canvas, 'height', 'set');
    vi.stubGlobal('window', { devicePixelRatio: 1.5 });
    const args = {
      canvas: f.canvas,
      project: createEmptyVideoProject('Layout', 200, 100),
      stage: null,
      ...(previewRasterSize ? { previewRasterSize } : {}),
    };
    const layout = resolvePreviewSceneCanvasLayout(args);
    expect(f.getContext).not.toHaveBeenCalled();
    expect(width).not.toHaveBeenCalled();
    expect(height).not.toHaveBeenCalled();
    expect(layout).toEqual({
      bounds: { width: 200, height: 200 },
      viewport: { width: 200, height: 100, offsetX: 0, offsetY: 50, scale: 1 },
      dpr: previewRasterSize ? 6.4 : 1.5,
      backing: previewRasterSize ?? { width: 300, height: 300 },
    });
    const prepared = resolvePreparedPreviewSceneCanvas({
      ...args,
      imageBank: {},
      shouldClearCanvas: false,
    })!;
    expect(prepared.bounds).toEqual(layout.bounds);
    expect(prepared.viewport).toEqual(layout.viewport);
    expect(prepared.dpr).toBe(layout.dpr);
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(layout.backing);
  }
);

it('uses live CSS stage bounds and detached viewport dimensions through resize', () => {
  const f = layoutFixture(0, 0),
    viewport = layoutFixture(960, 540);
  const stage = document.createElement('div');
  const rect = vi
    .spyOn(stage, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(20, 30, 300, 200));
  const args = {
    canvas: f.canvas,
    viewportCanvas: viewport.canvas,
    project: createEmptyVideoProject('Stage', 400, 200),
    stage,
  };
  const first = resolvePreviewSceneCanvasLayout(args);
  expect(first.bounds).toEqual({ left: 20, top: 30, width: 300, height: 200 });
  expect(first.viewport).toEqual({ width: 300, height: 150, offsetX: 0, offsetY: 25, scale: 0.75 });
  expect(f.getContext).not.toHaveBeenCalled();
  expect(viewport.getContext).not.toHaveBeenCalled();
  rect.mockReturnValue(new DOMRect(20, 30, 600, 400));
  const second = resolvePreviewSceneCanvasLayout(args);
  const prepared = resolvePreparedPreviewSceneCanvas({
    ...args,
    imageBank: {},
    shouldClearCanvas: false,
  })!;
  expect(second.viewport).toEqual({ width: 600, height: 300, offsetX: 0, offsetY: 50, scale: 1.5 });
  expect(prepared.bounds).toEqual(second.bounds);
  expect(prepared.viewport).toEqual(second.viewport);
  expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(second.backing);
  expect(viewport.canvas.width).toBe(300);
});

it('preserves the global DPR choice even when canvas owner-window DPR differs', () => {
  const f = layoutFixture(101, 51);
  vi.stubGlobal('window', { devicePixelRatio: 2 });
  const layout = resolvePreviewSceneCanvasLayout({
    canvas: f.canvas,
    project: createEmptyVideoProject('DPR', 202, 102),
    stage: null,
  });
  expect(layout.dpr).toBe(2);
  expect(layout.backing).toEqual({ width: 202, height: 102 });
  expect(f.getContext).not.toHaveBeenCalled();
});

it.each([undefined, { width: 480, height: 270 }])(
  'preserves zero-viewport preparation math without layout side effects: %j',
  (previewRasterSize) => {
    const f = layoutFixture(0, 0);
    const args = {
      canvas: f.canvas,
      project: createEmptyVideoProject('Empty', 200, 100),
      stage: null,
      ...(previewRasterSize ? { previewRasterSize } : {}),
    };
    const layout = resolvePreviewSceneCanvasLayout(args);
    expect(layout.bounds).toEqual({ width: 0, height: 0 });
    expect(layout.viewport.width).toBe(0);
    expect(layout.backing).toEqual(previewRasterSize ?? { width: 1, height: 1 });
    expect(f.canvas.width).toBe(300);
    expect(f.getContext).not.toHaveBeenCalled();
    expect(
      resolvePreparedPreviewSceneCanvas({ ...args, imageBank: {}, shouldClearCanvas: false })
    ).toBeNull();
    expect({ width: f.canvas.width, height: f.canvas.height }).toEqual(layout.backing);
  }
);
