import { expect, it, vi } from 'vitest';
import {
  createViewportPresetRuntimeState,
  drawViewportPresetFrame,
  resolveCanvasCropGeometry,
  resolveViewportPresetCropGeometry,
  updateViewportPresetDrawState,
  updateViewportPresetRuntimeCrop,
} from './helpers';

it('uses the reported viewport bounds when the source frame is larger', () => {
  expect(
    resolveViewportPresetCropGeometry({
      sourceSize: {
        width: 1920,
        height: 1080,
      },
      targetResolution: {
        width: 1600,
        height: 900,
      },
      viewportSizeInPixels: {
        width: 1280,
        height: 720,
      },
    })
  ).toEqual({
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1280,
    sourceHeight: 720,
    targetWidth: 1600,
    targetHeight: 900,
  });
});

it('normalizes odd canvas crop dimensions to codec-safe even dimensions', () => {
  expect(
    resolveCanvasCropGeometry({
      sourceSize: { width: 1365, height: 767 },
      cropRegion: { x: 0, y: 0, width: 1365, height: 767 },
    })
  ).toEqual({
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1364,
    sourceHeight: 766,
    targetWidth: 1364,
    targetHeight: 766,
  });
});

it('normalizes odd viewport preset targets to codec-safe even dimensions', () => {
  expect(
    resolveViewportPresetCropGeometry({
      sourceSize: { width: 1365, height: 767 },
      targetResolution: { width: 1365, height: 767 },
    })
  ).toEqual({
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1364,
    sourceHeight: 766,
    targetWidth: 1364,
    targetHeight: 766,
  });
});

it('normalizes odd viewport preset runtime state dimensions', () => {
  const state = createViewportPresetRuntimeState({
    sourceSize: { width: 1365, height: 767 },
    targetResolution: { width: 1365, height: 767 },
  });

  expect(state).toEqual(
    expect.objectContaining({
      targetWidth: 1364,
      targetHeight: 766,
      viewportWidth: 1364,
      viewportHeight: 766,
    })
  );

  updateViewportPresetRuntimeCrop(state, {
    targetResolution: { width: 1441, height: 901 },
    viewportSizeInPixels: { width: 1001, height: 701 },
  });

  expect(state).toEqual(
    expect.objectContaining({
      targetWidth: 1440,
      targetHeight: 900,
      viewportWidth: 1000,
      viewportHeight: 700,
    })
  );
});

it('keeps the full source frame when it already matches the viewport', () => {
  expect(
    resolveViewportPresetCropGeometry({
      sourceSize: {
        width: 1366,
        height: 768,
      },
      targetResolution: {
        width: 1366,
        height: 768,
      },
      viewportSizeInPixels: {
        width: 1366,
        height: 768,
      },
    })
  ).toEqual({
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1366,
    sourceHeight: 768,
    targetWidth: 1366,
    targetHeight: 768,
  });
});

it('clamps the viewport bounds when they exceed the source frame', () => {
  expect(
    resolveViewportPresetCropGeometry({
      sourceSize: {
        width: 1280,
        height: 720,
      },
      targetResolution: {
        width: 1920,
        height: 1080,
      },
      viewportSizeInPixels: {
        width: 1600,
        height: 900,
      },
    })
  ).toEqual({
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1280,
    sourceHeight: 720,
    targetWidth: 1920,
    targetHeight: 1080,
  });
});

it('updates runtime crop state and ignores stale draw-state epochs', () => {
  const state = createViewportPresetRuntimeState({
    targetResolution: { width: 1600, height: 900 },
    sourceSize: { width: 1920, height: 1080 },
  });

  updateViewportPresetRuntimeCrop(state, {
    targetResolution: { width: 1280, height: 720 },
    viewportSizeInPixels: { width: 1024, height: 576 },
  });

  expect(
    updateViewportPresetDrawState(state, {
      frozen: true,
      navigationEpoch: -1,
    })
  ).toBe(false);
  expect(
    updateViewportPresetDrawState(state, {
      frozen: true,
      navigationEpoch: 1,
    })
  ).toBe(true);
  expect(state).toEqual(
    expect.objectContaining({
      targetWidth: 1280,
      targetHeight: 720,
      viewportWidth: 1024,
      viewportHeight: 576,
      drawFrozen: true,
      navigationEpoch: 1,
    })
  );
});

it('draws frames only when the runtime state is not frozen', () => {
  const clearRect = vi.fn();
  const drawImage = vi.fn();
  const canvas = { width: 1280, height: 720 };
  const state = createViewportPresetRuntimeState({
    targetResolution: { width: 1280, height: 720 },
    sourceSize: { width: 1920, height: 1080 },
    viewportSizeInPixels: { width: 1600, height: 900 },
  });
  const video = { videoWidth: 1920, videoHeight: 1080 } as CanvasImageSource &
    Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'>;

  expect(
    drawViewportPresetFrame({
      canvas,
      ctx: { clearRect, drawImage },
      state,
      video,
    })
  ).toBe(true);
  expect(clearRect).toHaveBeenCalledWith(0, 0, 1280, 720);
  expect(drawImage).toHaveBeenCalledOnce();

  state.drawFrozen = true;
  expect(
    drawViewportPresetFrame({
      canvas,
      ctx: { clearRect, drawImage },
      state,
      video,
    })
  ).toBe(false);
});

it('falls back to runtime dimensions when the video reports zero size', () => {
  const clearRect = vi.fn();
  const drawImage = vi.fn();
  const state = createViewportPresetRuntimeState({
    targetResolution: { width: 800, height: 600 },
    sourceSize: { width: 1280, height: 720 },
    viewportSizeInPixels: { width: 640, height: 360 },
  });

  expect(
    drawViewportPresetFrame({
      canvas: { width: 800, height: 600 },
      ctx: { clearRect, drawImage },
      state,
      video: { videoWidth: 0, videoHeight: 0 } as CanvasImageSource &
        Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'>,
    })
  ).toBe(true);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 360, 0, 0, 800, 600);
});

it('falls back to target dimensions when both video and runtime viewport sizes are zero', () => {
  const clearRect = vi.fn();
  const drawImage = vi.fn();
  const state = createViewportPresetRuntimeState({
    targetResolution: { width: 800, height: 600 },
    sourceSize: { width: 1280, height: 720 },
  });

  state.viewportWidth = 0;
  state.viewportHeight = 0;

  expect(
    drawViewportPresetFrame({
      canvas: { width: 800, height: 600 },
      ctx: { clearRect, drawImage },
      state,
      video: { videoWidth: 0, videoHeight: 0 } as CanvasImageSource &
        Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'>,
    })
  ).toBe(true);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1, 1, 0, 0, 800, 600);
});
