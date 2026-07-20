import { expect, it, vi } from 'vitest';
import {
  createFramePacer,
  createViewportPresetRuntimeState,
  drawViewportPresetFrame,
  updateViewportPresetDrawState,
  updateViewportPresetRuntimeCrop,
} from './helpers';

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

function createDrawContext() {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
}

function createVideoFrame() {
  return { videoWidth: 1920, videoHeight: 1080 } as unknown as CanvasImageSource &
    Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'>;
}

it('does not clear or redraw while the viewport frame is frozen', () => {
  const state = createRuntimeState();
  const ctx = createDrawContext();
  const video = createVideoFrame();

  updateViewportPresetDrawState(state, { frozen: true, navigationEpoch: 1 });

  expect(
    drawViewportPresetFrame({
      canvas: { width: 1600, height: 900 },
      ctx,
      state,
      video,
    })
  ).toBe(false);
  expect(ctx.clearRect).not.toHaveBeenCalled();
  expect(ctx.drawImage).not.toHaveBeenCalled();
});

it('applies crop updates while frozen and resumes drawing after thaw', () => {
  const state = createRuntimeState();
  const ctx = createDrawContext();
  const video = createVideoFrame();

  updateViewportPresetDrawState(state, { frozen: true, navigationEpoch: 2 });
  updateViewportPresetRuntimeCrop(state, {
    targetResolution: {
      width: 1920,
      height: 1080,
    },
    viewportSizeInPixels: {
      width: 1365,
      height: 768,
    },
  });
  updateViewportPresetDrawState(state, { frozen: false, navigationEpoch: 2 });

  expect(
    drawViewportPresetFrame({
      canvas: { width: 1920, height: 1080 },
      ctx,
      state,
      video,
    })
  ).toBe(true);
  expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
  expect(ctx.drawImage).toHaveBeenCalledWith(video, 0, 0, 1364, 768, 0, 0, 1920, 1080);
});

it('paces viewport draws on frame boundaries instead of every animation tick', () => {
  const pacer = createFramePacer(10);

  expect(pacer.shouldRender(0)).toBe(true);
  expect(pacer.shouldRender(50)).toBe(false);
  expect(pacer.shouldRender(100)).toBe(true);
  expect(pacer.shouldRender(150)).toBe(false);
  expect(pacer.shouldRender(220)).toBe(true);
});
