import { afterEach, expect, it, vi } from 'vitest';
import { createPointerPreviewScheduler, toPointerPreviewPoint } from './frame';

let nextFrameId = 0;
let scheduledFrame: FrameRequestCallback | null = null;

function installAnimationFrameMock() {
  nextFrameId = 0;
  scheduledFrame = null;

  vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
    scheduledFrame = callback;
    nextFrameId += 1;
    return nextFrameId;
  }) as typeof requestAnimationFrame);

  vi.stubGlobal('cancelAnimationFrame', ((frameId: number) => {
    if (frameId === nextFrameId) {
      scheduledFrame = null;
    }
  }) as typeof cancelAnimationFrame);
}

function flushScheduledFrame() {
  const callback = scheduledFrame;
  scheduledFrame = null;
  callback?.(16);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('coalesces pointer previews to the latest point inside one animation frame', () => {
  installAnimationFrameMock();
  const onPreview = vi.fn();
  const scheduler = createPointerPreviewScheduler(onPreview);

  scheduler.schedule(toPointerPreviewPoint({ clientX: 10, clientY: 20 }));
  scheduler.schedule(toPointerPreviewPoint({ clientX: 40, clientY: 60 }));
  flushScheduledFrame();

  expect(onPreview).toHaveBeenCalledTimes(1);
  expect(onPreview).toHaveBeenCalledWith({
    clientX: 40,
    clientY: 60,
  });
});

it('cancels pending previews and keeps the next schedule usable', () => {
  installAnimationFrameMock();
  const onPreview = vi.fn();
  const scheduler = createPointerPreviewScheduler(onPreview);

  scheduler.schedule(toPointerPreviewPoint({ clientX: 10, clientY: 20 }));
  scheduler.cancel();
  flushScheduledFrame();

  expect(onPreview).not.toHaveBeenCalled();

  scheduler.schedule(toPointerPreviewPoint({ clientX: 30, clientY: 45 }));
  flushScheduledFrame();

  expect(onPreview).toHaveBeenCalledTimes(1);
  expect(onPreview).toHaveBeenCalledWith({
    clientX: 30,
    clientY: 45,
  });
});
