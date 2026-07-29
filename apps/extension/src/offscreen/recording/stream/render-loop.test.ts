import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoRenderLoop } from './render-loop';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('renders live output on source presentation frames while held-frame cadence stays independent', async () => {
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  const cancelVideoFrameCallback = vi.fn((callbackId: number) => callbacks.delete(callbackId));
  const requestVideoFrameCallback = vi.fn((callback: VideoFrameRequestCallback) => {
    const callbackId = callbacks.size + 1;
    callbacks.set(callbackId, callback);
    return callbackId;
  });
  const drawHeldFrame = vi.fn();
  const drawSourceFrame = vi.fn();
  const loop = createVideoRenderLoop({
    drawHeldFrame,
    drawSourceFrame,
    frameIntervalMs: 20,
    video: {
      cancelVideoFrameCallback,
      requestVideoFrameCallback,
    },
  });

  loop.start();
  expect(drawSourceFrame).toHaveBeenCalledOnce();
  expect(requestVideoFrameCallback).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(60);
  expect(drawHeldFrame).toHaveBeenCalledTimes(3);
  expect(drawSourceFrame).toHaveBeenCalledOnce();

  callbacks.get(1)?.(16, {} as VideoFrameCallbackMetadata);
  expect(drawSourceFrame).toHaveBeenCalledTimes(2);
  expect(requestVideoFrameCallback).toHaveBeenCalledTimes(2);

  const heldFramesBeforeStop = drawHeldFrame.mock.calls.length;
  loop.stop();
  expect(cancelVideoFrameCallback).toHaveBeenCalledWith(2);
  await vi.advanceTimersByTimeAsync(60);
  expect(drawHeldFrame).toHaveBeenCalledTimes(heldFramesBeforeStop);
  expect(drawSourceFrame).toHaveBeenCalledTimes(2);
});

it('falls back to interval rendering and clears both cadences on stop', async () => {
  const drawHeldFrame = vi.fn();
  const drawSourceFrame = vi.fn();
  const loop = createVideoRenderLoop({
    drawHeldFrame,
    drawSourceFrame,
    frameIntervalMs: 20,
    video: {},
  });

  loop.start();
  await vi.advanceTimersByTimeAsync(60);

  expect(drawHeldFrame).toHaveBeenCalledTimes(3);
  expect(drawSourceFrame).toHaveBeenCalledTimes(4);
  loop.stop();
  await vi.advanceTimersByTimeAsync(60);
  expect(drawHeldFrame).toHaveBeenCalledTimes(3);
  expect(drawSourceFrame).toHaveBeenCalledTimes(4);
});

it('retains source-frame scheduling after one draw failure', () => {
  const callbacks: VideoFrameRequestCallback[] = [];
  const drawSourceFrame = vi.fn().mockImplementationOnce(() => undefined);
  const loop = createVideoRenderLoop({
    drawHeldFrame: vi.fn(),
    drawSourceFrame,
    frameIntervalMs: 20,
    video: {
      cancelVideoFrameCallback: vi.fn(),
      requestVideoFrameCallback: vi.fn((callback: VideoFrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    },
  });
  loop.start();
  drawSourceFrame.mockImplementationOnce(() => {
    throw new Error('draw failed');
  });

  expect(() => callbacks.shift()?.(16, {} as VideoFrameCallbackMetadata)).toThrow('draw failed');
  expect(callbacks).toHaveLength(1);
  loop.stop();
});
