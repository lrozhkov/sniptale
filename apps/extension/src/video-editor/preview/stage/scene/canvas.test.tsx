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
