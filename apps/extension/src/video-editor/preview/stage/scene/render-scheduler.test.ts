// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createPreviewSceneRenderScheduler, type PreviewSceneRenderJob } from './render-scheduler';

it('runs one preview render at a time and keeps only the latest pending frame', async () => {
  const releaseRender: Array<() => void> = [];
  const onError = vi.fn();
  const render = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        releaseRender.push(resolve);
      })
  );
  const scheduler = createPreviewSceneRenderScheduler({ onError, render });
  const first = createJob(1);
  const second = createJob(2);
  const third = createJob(3);

  const cleanupFirst = scheduler.enqueue(first);
  scheduler.enqueue(second);
  scheduler.enqueue(third);
  cleanupFirst();

  expect(render).toHaveBeenCalledTimes(1);
  expect(first.controller.signal.aborted).toBe(true);
  expect(second.controller.signal.aborted).toBe(true);
  expect(third.controller.signal.aborted).toBe(false);

  releaseRender[0]?.();
  await Promise.resolve();
  await Promise.resolve();

  expect(render).toHaveBeenCalledTimes(2);
  expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 3 }));
  expect(onError).not.toHaveBeenCalled();
});

it('coalesces playback frames to the latest pending frame cadence', async () => {
  vi.useFakeTimers();
  const releaseRender: Array<() => void> = [];
  const onError = vi.fn();
  const onSuccess = vi.fn();
  const render = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        releaseRender.push(resolve);
      })
  );
  const scheduler = createPreviewSceneRenderScheduler({ onError, onSuccess, render });
  const first = createJob(1, true);
  const second = createJob(2, true);

  const cleanupFirst = scheduler.enqueue(first);
  cleanupFirst();
  scheduler.enqueue(second);
  expect(first.controller.signal.aborted).toBe(false);
  releaseRender[0]?.();
  await Promise.resolve();
  await Promise.resolve();

  expect(render).toHaveBeenCalledTimes(1);
  expect(onSuccess).toHaveBeenCalledOnce();

  vi.advanceTimersByTime(15);
  expect(render).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1);
  expect(render).toHaveBeenCalledTimes(2);
  expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 2 }));
  vi.useRealTimers();
});

it('backpressures effect playback to at most thirty preview renders per second', async () => {
  vi.useFakeTimers();
  const render = vi.fn(async () => undefined);
  const scheduler = createPreviewSceneRenderScheduler({ onError: vi.fn(), render });
  const first = createJob(1, true, true);
  const second = createJob(2, true, true);

  scheduler.enqueue(first);
  await Promise.resolve();
  await Promise.resolve();
  scheduler.enqueue(second);

  vi.advanceTimersByTime(32);
  expect(render).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2);
  expect(render).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it('aborts an active playback render when a paused frame supersedes it', () => {
  const render = vi.fn(() => new Promise<void>(() => undefined));
  const scheduler = createPreviewSceneRenderScheduler({ onError: vi.fn(), render });
  const playbackFrame = createJob(1, true);
  const pausedFrame = createJob(2);

  scheduler.enqueue(playbackFrame);
  scheduler.enqueue(pausedFrame);

  expect(playbackFrame.controller.signal.aborted).toBe(true);
  expect(pausedFrame.controller.signal.aborted).toBe(false);
});

it('aborts and suppresses stale playback work when a playing seek changes generation', async () => {
  const releaseRender: Array<() => void> = [];
  const onSuccess = vi.fn();
  const render = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        releaseRender.push(resolve);
      })
  );
  const scheduler = createPreviewSceneRenderScheduler({
    onError: vi.fn(),
    onSuccess,
    render,
  });
  const playbackFrame = createJob(1, true, false, 0);
  const seekFrame = createJob(2, true, false, 1);

  scheduler.enqueue(playbackFrame);
  scheduler.enqueue(seekFrame);

  expect(playbackFrame.controller.signal.aborted).toBe(true);
  expect(seekFrame.controller.signal.aborted).toBe(false);
  releaseRender[0]?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(onSuccess).not.toHaveBeenCalled();
  scheduler.dispose();
});

it('aborts superseded active work and suppresses its stale recovery signal', async () => {
  const releaseRender: Array<() => void> = [];
  const onError = vi.fn();
  const onSuccess = vi.fn();
  const render = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        releaseRender.push(resolve);
      })
  );
  const scheduler = createPreviewSceneRenderScheduler({ onError, onSuccess, render });
  const first = createJob(1);
  const second = createJob(2);

  const cleanupFirst = scheduler.enqueue(first);
  scheduler.enqueue(second);
  cleanupFirst();

  expect(first.controller.signal.aborted).toBe(true);
  expect(second.controller.signal.aborted).toBe(false);

  releaseRender[0]?.();
  await Promise.resolve();
  await Promise.resolve();

  expect(render).toHaveBeenCalledTimes(2);
  expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 2 }));
  expect(onError).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();

  releaseRender[1]?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(onSuccess).toHaveBeenCalledOnce();
});

it('suppresses errors from aborted preview renders', async () => {
  const onError = vi.fn();
  const render = vi.fn(async () => {
    throw new Error('renderer failed');
  });
  const scheduler = createPreviewSceneRenderScheduler({ onError, render });
  const job = createJob(1);

  scheduler.enqueue(job);
  scheduler.dispose();
  await Promise.resolve();
  await Promise.resolve();

  expect(onError).not.toHaveBeenCalled();
});

it('reports recovery only after a non-aborted render succeeds', async () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();
  const scheduler = createPreviewSceneRenderScheduler({
    onError,
    onSuccess,
    render: vi.fn(async () => undefined),
  });

  scheduler.enqueue(createJob(1));
  await Promise.resolve();
  await Promise.resolve();

  expect(onSuccess).toHaveBeenCalledTimes(1);
  expect(onError).not.toHaveBeenCalled();
});

function createJob(
  currentTime: number,
  isPlaybackFrame = false,
  isEffectRuntimeFrame = false,
  renderGeneration = 0
): PreviewSceneRenderJob {
  return {
    canvas: document.createElement('canvas'),
    controller: new AbortController(),
    currentTime,
    imageBank: {},
    isEffectRuntimeFrame,
    isPlaybackFrame,
    project: {} as PreviewSceneRenderJob['project'],
    renderGeneration,
    stage: null,
    videoRefs: { current: {} },
  };
}
