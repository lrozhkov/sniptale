// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { loggerLogMock } = vi.hoisted(() => ({
  loggerLogMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    log: loggerLogMock,
  }),
}));

import {
  createViewportPresetCanvas,
  createViewportPresetCropUpdater,
  createViewportPresetDrawStateUpdater,
  createViewportPresetFrameDrawer,
} from './runtime';
import { createViewportPresetRuntimeState } from './helpers';

function createRuntimeState() {
  return createViewportPresetRuntimeState({
    targetResolution: {
      width: 1600,
      height: 900,
    },
    sourceSize: {
      width: 1920,
      height: 1080,
    },
    viewportSizeInPixels: {
      width: 1280,
      height: 720,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

function createViewportVideo() {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
  return video;
}

it('creates a canvas/runtime bundle and only draws while the loop is active', () => {
  const fakeCtx = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx);
  const video = createViewportVideo();

  const { canvas, ctx, state } = createViewportPresetCanvas(
    video,
    { width: 1600, height: 900 },
    { width: 1280, height: 720 }
  );
  const activeDrawer = createViewportPresetFrameDrawer({
    canvas,
    ctx,
    state,
    video,
    isRunning: () => true,
  });
  const stoppedDrawer = createViewportPresetFrameDrawer({
    canvas,
    ctx,
    state,
    video,
    isRunning: () => false,
  });

  expect(canvas.width).toBe(1600);
  expect(canvas.height).toBe(900);

  stoppedDrawer();
  expect(fakeCtx.drawImage).not.toHaveBeenCalled();

  activeDrawer();
  expect(fakeCtx.drawImage).toHaveBeenCalledOnce();
});

it('updates canvas dimensions and runtime crop state together', () => {
  const state = createRuntimeState();
  const canvas = { height: 900, width: 1600 };
  const video = { videoHeight: 1080, videoWidth: 1920 };

  createViewportPresetCropUpdater(
    canvas,
    state,
    video
  )({
    targetResolution: {
      width: 1920,
      height: 1080,
    },
    viewportSizeInPixels: {
      width: 1365,
      height: 768,
    },
  });

  expect(state).toMatchObject({
    targetHeight: 1080,
    targetWidth: 1920,
    viewportHeight: 768,
    viewportWidth: 1364,
  });
  expect(canvas).toEqual({ height: 1080, width: 1920 });
  expect(loggerLogMock).toHaveBeenCalledWith(
    'Viewport preset crop updated',
    expect.objectContaining({
      targetWidth: 1920,
      targetHeight: 1080,
    })
  );
});

it('ignores stale navigation epochs when updating draw state', () => {
  const state = createRuntimeState();
  const video = { videoHeight: 1080, videoWidth: 1920 };
  const updateDrawState = createViewportPresetDrawStateUpdater(state, video);

  updateDrawState({ frozen: true, navigationEpoch: 3 });
  updateDrawState({ frozen: false, navigationEpoch: 2 });

  expect(state.drawFrozen).toBe(true);
  expect(state.navigationEpoch).toBe(3);
  expect(loggerLogMock).toHaveBeenCalledTimes(1);
});

it('logs draw-state updates when the navigation epoch advances', () => {
  const state = createRuntimeState();
  const video = { videoHeight: 1080, videoWidth: 1920 };
  const updateDrawState = createViewportPresetDrawStateUpdater(state, video);

  updateDrawState({ frozen: false, navigationEpoch: 1 });
  updateDrawState({ frozen: true, navigationEpoch: 2 });

  expect(state.drawFrozen).toBe(true);
  expect(state.navigationEpoch).toBe(2);
  expect(loggerLogMock).toHaveBeenCalledTimes(2);
});
