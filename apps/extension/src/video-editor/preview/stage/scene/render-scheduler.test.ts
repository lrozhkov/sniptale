// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const admit = () => vi.advanceTimersByTimeAsync(20);
import { createPreviewSceneRenderScheduler, type PreviewSceneRenderJob } from './render-scheduler';

it('prepares one reserved frame before the active GPU render completes and releases it afterward', async () => {
  const firstCompletion = Promise.withResolvers<void>();
  const secondCompletion = Promise.withResolvers<void>();
  const render = vi
    .fn()
    .mockReturnValueOnce(firstCompletion.promise)
    .mockReturnValueOnce(secondCompletion.promise);
  const release = vi.fn();
  const prepare = vi.fn(
    async (
      input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]
    ) => ({ input, release })
  );
  const scheduler = createPreviewSceneRenderScheduler({ render, prepare, onError: vi.fn() });
  const first = createJob(1, true);
  const second = { ...first, currentTime: 2, controller: new AbortController() };
  scheduler.enqueue(first);
  render.mock.calls[0]![0].onGpuSubmitted?.();
  scheduler.enqueue(second);
  await Promise.resolve();
  expect(prepare).toHaveBeenCalledOnce();
  expect(prepare.mock.calls[0]![0].currentTime).toBe(2);
  expect(prepare.mock.calls[0]![0]).not.toHaveProperty('controller');
  expect(render).toHaveBeenCalledOnce();
  expect(release).not.toHaveBeenCalled();
  firstCompletion.resolve();
  await admit();
  expect(render).toHaveBeenCalledTimes(2);
  expect(render.mock.calls[1]![0].currentTime).toBe(2);
  expect(release).not.toHaveBeenCalled();
  secondCompletion.resolve();
  await admit();
  expect(release).toHaveBeenCalledOnce();
  scheduler.dispose();
});

it('keeps one recent reserved frame and does not prepare every incoming playback tick', async () => {
  const completion = Promise.withResolvers<void>();
  const release = vi.fn();
  const render = vi.fn().mockReturnValueOnce(completion.promise).mockResolvedValue(undefined);
  const prepare = vi.fn(
    async (
      input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]
    ) => ({ input, release })
  );
  const scheduler = createPreviewSceneRenderScheduler({ render, prepare, onError: vi.fn() });
  const first = createJob(1, true);
  const second = { ...first, currentTime: 1 + 1 / 60, controller: new AbortController() };
  const third = { ...first, currentTime: 1 + 2 / 60, controller: new AbortController() };
  scheduler.enqueue(first);
  render.mock.calls[0]![0].onGpuSubmitted?.();
  scheduler.enqueue(second);
  await Promise.resolve();
  scheduler.enqueue(third);
  expect(prepare).toHaveBeenCalledOnce();
  expect(third.controller.signal.aborted).toBe(true);
  expect(second.controller.signal.aborted).toBe(false);
  completion.resolve();
  await admit();
  expect(render).toHaveBeenCalledTimes(2);
  expect(render.mock.calls[1]![0].currentTime).toBe(second.currentTime);
  expect(release).toHaveBeenCalledOnce();
  scheduler.dispose();
});

it('releases an expired ready frame and prepares the newer playback snapshot', async () => {
  const completion = Promise.withResolvers<void>();
  const releases = [vi.fn(), vi.fn()];
  const render = vi.fn().mockReturnValueOnce(completion.promise).mockResolvedValue(undefined);
  const prepare = vi.fn(
    async (
      input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]
    ) => ({ input, release: releases[input.currentTime === 2 ? 0 : 1]! })
  );
  const scheduler = createPreviewSceneRenderScheduler({ render, prepare, onError: vi.fn() });
  const first = createJob(1, true);
  const second = { ...first, currentTime: 2, controller: new AbortController() };
  scheduler.enqueue(first);
  render.mock.calls[0]![0].onGpuSubmitted?.();
  scheduler.enqueue(second);
  await admit();
  scheduler.enqueue({ ...first, currentTime: 2.2, controller: new AbortController() });
  await admit();
  expect(second.controller.signal.aborted).toBe(true);
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(prepare).toHaveBeenCalledTimes(2);
  completion.resolve();
  await admit();
  expect(render.mock.calls[1]![0].currentTime).toBe(2.2);
  expect(releases[1]).toHaveBeenCalledOnce();
  scheduler.dispose();
});

it('admits a seek while cancelled preparation settles and never renders its stale result', async () => {
  const completion = Promise.withResolvers<void>();
  const prepared = Promise.withResolvers<void>();
  const release = vi.fn();
  const render = vi.fn().mockReturnValueOnce(completion.promise).mockResolvedValue(undefined);
  const prepare = vi.fn(
    async (
      input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]
    ) => {
      await prepared.promise;
      return { input, release };
    }
  );
  const onError = vi.fn();
  const scheduler = createPreviewSceneRenderScheduler({ render, prepare, onError });
  const first = createJob(1, true);
  const second = { ...first, currentTime: 2, controller: new AbortController() };
  scheduler.enqueue(first);
  render.mock.calls[0]![0].onGpuSubmitted?.();
  scheduler.enqueue(second);
  scheduler.enqueue({
    ...first,
    currentTime: 0.5,
    renderGeneration: 1,
    isPlaybackFrame: false,
    controller: new AbortController(),
  });
  expect(second.controller.signal.aborted).toBe(true);
  completion.resolve();
  await admit();
  expect(render).toHaveBeenCalledTimes(2);
  expect(render.mock.calls[1]![0].currentTime).toBe(0.5);
  prepared.resolve();
  await admit();
  expect(release).toHaveBeenCalledOnce();
  expect(render).toHaveBeenCalledTimes(2);
  expect(onError).not.toHaveBeenCalled();
  scheduler.dispose();
});

it.each(['ready', 'pending'] as const)(
  'drains %s preparation on disposal without publishing stale results',
  async (phase) => {
    const completion = Promise.withResolvers<void>();
    const ready = Promise.withResolvers<void>();
    const release = vi.fn();
    const render = vi.fn(
      (_input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]) =>
        completion.promise
    );
    const prepare = vi.fn(
      async (
        input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]
      ) => {
        await ready.promise;
        return { input, release };
      }
    );
    const onSuccess = vi.fn();
    const scheduler = createPreviewSceneRenderScheduler({
      render,
      prepare,
      onSuccess,
      onError: vi.fn(),
    });
    const first = createJob(1, true);
    const second = { ...first, currentTime: 2, controller: new AbortController() };
    scheduler.enqueue(first);
    render.mock.calls[0]![0].onGpuSubmitted?.();
    scheduler.enqueue(second);
    if (phase === 'ready') {
      ready.resolve();
      await admit();
    }
    scheduler.dispose();
    expect(second.controller.signal.aborted).toBe(true);
    ready.resolve();
    completion.resolve();
    await admit();
    expect(release).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledOnce();
    const late = createJob(3, true);
    scheduler.enqueue(late);
    expect(late.controller.signal.aborted).toBe(true);
    expect(render).toHaveBeenCalledOnce();
  }
);

it('reports preparation failure after the previous GPU job settles', async () => {
  const completion = Promise.withResolvers<void>();
  const failure = new Error('preparation failed');
  const render = vi.fn(
    (_input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]) =>
      completion.promise
  );
  const prepare = vi.fn(async () => {
    throw failure;
  });
  const onError = vi.fn();
  const scheduler = createPreviewSceneRenderScheduler({ render, prepare, onError });
  const first = createJob(1, true);
  scheduler.enqueue(first);
  render.mock.calls[0]![0].onGpuSubmitted?.();
  scheduler.enqueue({ ...first, currentTime: 2, controller: new AbortController() });
  await admit();
  expect(onError).not.toHaveBeenCalled();
  completion.resolve();
  await admit();
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(render).toHaveBeenCalledOnce();
  scheduler.dispose();
});

it('does not prepare the next frame until the active frame actually submits GPU work', async () => {
  const completion = Promise.withResolvers<void>();
  const render = vi.fn(
    (_input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]) =>
      completion.promise
  );
  const prepare = vi.fn(
    async (
      input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]
    ) => ({ input, release: vi.fn() })
  );
  const scheduler = createPreviewSceneRenderScheduler({ render, prepare, onError: vi.fn() });
  const first = createJob(1, true);
  scheduler.enqueue(first);
  scheduler.enqueue({ ...first, currentTime: 2, controller: new AbortController() });
  await Promise.resolve();
  expect(prepare).not.toHaveBeenCalled();
  render.mock.calls[0]![0].onGpuSubmitted?.();
  expect(prepare).toHaveBeenCalledOnce();
  completion.resolve();
  await admit();
  scheduler.dispose();
});

it('invalidates a prepared frame when the effect runtime retries', async () => {
  const completion = Promise.withResolvers<void>();
  const release = vi.fn();
  const render = vi.fn().mockReturnValueOnce(completion.promise).mockResolvedValue(undefined);
  const prepare = vi.fn(
    async (
      input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]
    ) => ({ input, release })
  );
  const scheduler = createPreviewSceneRenderScheduler({ render, prepare, onError: vi.fn() });
  const first = { ...createJob(1, true), runtimeVersion: 0 };
  scheduler.enqueue(first);
  render.mock.calls[0]![0].onGpuSubmitted?.();
  const reserved = { ...first, currentTime: 1.01, controller: new AbortController() };
  scheduler.enqueue(reserved);
  await admit();
  scheduler.enqueue({
    ...first,
    currentTime: 1.02,
    runtimeVersion: 1,
    controller: new AbortController(),
  });
  await admit();
  expect(reserved.controller.signal.aborted).toBe(true);
  expect(release).toHaveBeenCalledOnce();
  completion.resolve();
  await admit();
  expect(render.mock.calls[1]![0].currentTime).toBe(1.02);
  expect(render.mock.calls[1]![0]).not.toHaveProperty('runtimeVersion');
  scheduler.dispose();
});

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
  await admit();
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

  await admit();
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

  vi.advanceTimersByTime(2);
  expect(render).toHaveBeenCalledTimes(2);
  expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 2 }));
  vi.useRealTimers();
});

it('uses the configured thirty FPS for effect playback', async () => {
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
  await admit();
  scheduler.enqueue(second);
  cleanupFirst();

  expect(first.controller.signal.aborted).toBe(true);
  expect(second.controller.signal.aborted).toBe(false);

  releaseRender[0]?.();
  await Promise.resolve();
  await Promise.resolve();

  await admit();
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
  await admit();
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
    project: { fps: isEffectRuntimeFrame ? 30 : 60 } as PreviewSceneRenderJob['project'],
    renderGeneration,
    stage: null,
    videoRefs: { current: {} },
  };
}

it.each(['rejected', 'not-presented'])('does not count a %s playback render', async (outcome) => {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const scheduler = createPreviewSceneRenderScheduler({
    onSuccess,
    onError,
    render: async () => {
      if (outcome === 'rejected') throw new Error('failed');
      return false;
    },
  });
  scheduler.enqueue(createJob(1, true));
  await Promise.resolve();
  await Promise.resolve();
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledTimes(outcome === 'rejected' ? 1 : 0);
  scheduler.dispose();
});

it('returns before paused preparation and admits only the latest control snapshot', async () => {
  const render = vi.fn(async () => undefined);
  const scheduler = createPreviewSceneRenderScheduler({ onError: vi.fn(), render });
  const first = createJob(1),
    latest = createJob(2);
  scheduler.enqueue(first);
  scheduler.enqueue(latest);
  expect(render).not.toHaveBeenCalled();
  expect(first.controller.signal.aborted).toBe(true);
  await admit();
  expect(render).toHaveBeenCalledOnce();
  expect(render).toHaveBeenCalledWith(expect.objectContaining({ currentTime: 2 }));
  scheduler.dispose();
});

it('forwards a completed rendered-camera receipt without evaluating a second frame', async () => {
  const job = createJob(1, true);
  const camera = {
    scale: 2,
    viewportX: 123,
    viewportY: 9,
    focusPoint: { x: 0, y: 0 },
    motionBlurAmount: 0,
    regionId: null,
    viewportHeight: 100,
    viewportWidth: 200,
  };
  const presentation = { camera, time: 1 };
  const onSuccess = vi.fn();
  const render = vi.fn(async () => presentation);
  const scheduler = createPreviewSceneRenderScheduler({ onError: vi.fn(), onSuccess, render });
  scheduler.enqueue(job);
  await admit();
  expect(onSuccess).toHaveBeenCalledWith(job, presentation);
  expect(render).toHaveBeenCalledOnce();
  scheduler.dispose();
});

it('rejects an old backend publication while a playing renderer switch waits for completion', async () => {
  const firstCompletion = Promise.withResolvers<void>();
  const render = vi.fn().mockReturnValueOnce(firstCompletion.promise).mockResolvedValue(undefined);
  const onSuccess = vi.fn();
  const scheduler = createPreviewSceneRenderScheduler({ render, onSuccess, onError: vi.fn() });
  const gpu = { ...createJob(1, true), previewRenderer: 'gpu' as const };
  const standard = { ...createJob(2, true), previewRenderer: 'legacy' as const };
  scheduler.enqueue(gpu);
  scheduler.enqueue(standard);
  expect(gpu.controller.signal.aborted).toBe(true);
  expect(render).toHaveBeenCalledOnce();
  firstCompletion.resolve();
  await vi.advanceTimersByTimeAsync(40);
  expect(onSuccess).toHaveBeenCalledExactlyOnceWith(standard, undefined);
  expect(render).toHaveBeenCalledTimes(2);
  scheduler.dispose();
});

function gpuPresentation() {
  return {
    camera: {
      scale: 2,
      viewportX: 123,
      viewportY: 9,
      focusPoint: { x: 0, y: 0 },
      motionBlurAmount: 0,
      regionId: null,
      viewportHeight: 100,
      viewportWidth: 200,
    },
    time: 1,
    output: { canvas: document.createElement('canvas'), release: vi.fn() },
  };
}

it.each(['aborted', 'disposed'] as const)(
  'releases a late completed GPU output after its job is %s',
  async (operation) => {
    const completion = Promise.withResolvers<ReturnType<typeof gpuPresentation>>();
    const presentation = gpuPresentation();
    const onSuccess = vi.fn(() => true),
      onError = vi.fn();
    const scheduler = createPreviewSceneRenderScheduler({
      render: () => completion.promise,
      onSuccess,
      onError,
    });
    const job = createJob(1, true);
    scheduler.enqueue(job);
    if (operation === 'aborted') job.controller.abort();
    else scheduler.dispose();
    expect(presentation.output.release).not.toHaveBeenCalled();
    completion.resolve(presentation);
    await admit();
    expect(presentation.output.release).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    scheduler.dispose();
  }
);

it.each(['no-handler', 'void', 'refused'] as const)(
  'releases a direct output without transfer acknowledgement: %s',
  async (kind) => {
    const presentation = gpuPresentation();
    const onSuccess =
      kind === 'no-handler' ? undefined : vi.fn(() => (kind === 'refused' ? false : undefined));
    const scheduler = createPreviewSceneRenderScheduler({
      render: async () => presentation,
      onError: vi.fn(),
      ...(onSuccess ? { onSuccess } : {}),
    });
    scheduler.enqueue(createJob(1, true));
    await admit();
    expect(presentation.output.release).toHaveBeenCalledOnce();
    scheduler.dispose();
  }
);

it('transfers a direct output only after an explicit frontend acknowledgement', async () => {
  const presentation = gpuPresentation();
  const onSuccess = vi.fn(() => true);
  const scheduler = createPreviewSceneRenderScheduler({
    render: async () => presentation,
    onSuccess,
    onError: vi.fn(),
  });
  const job = createJob(1, true);
  scheduler.enqueue(job);
  await admit();
  expect(onSuccess).toHaveBeenCalledWith(job, presentation);
  expect(presentation.output.release).not.toHaveBeenCalled();
  scheduler.dispose();
  expect(presentation.output.release).not.toHaveBeenCalled();
  presentation.output.release();
});

it('releases rejected frontend publication, reports its error and admits the queued job', async () => {
  const failure = new Error('publication rejected');
  const first = gpuPresentation(),
    second = gpuPresentation();
  const completion = Promise.withResolvers<typeof first>();
  const render = vi.fn().mockReturnValueOnce(completion.promise).mockResolvedValueOnce(second);
  const onSuccess = vi
    .fn()
    .mockImplementationOnce(() => {
      throw failure;
    })
    .mockReturnValueOnce(true);
  const onError = vi.fn();
  const scheduler = createPreviewSceneRenderScheduler({ render, onSuccess, onError });
  scheduler.enqueue(createJob(1, true));
  scheduler.enqueue(createJob(2, true));
  completion.resolve(first);
  await admit();
  expect(first.output.release).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  expect(render).toHaveBeenCalledTimes(2);
  expect(second.output.release).not.toHaveBeenCalled();
  scheduler.dispose();
  second.output.release();
});

it('forwards acquisition without exposing the frontend owner to the renderer', async () => {
  const framePresenter = { acquire: vi.fn(), publish: vi.fn() };
  const render = vi.fn(
    async (
      _input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]
    ) => undefined
  );
  const scheduler = createPreviewSceneRenderScheduler({ render, onError: vi.fn() });
  scheduler.enqueue({
    ...createJob(1, true),
    framePresenter,
    acquireGpuOutput: framePresenter.acquire,
  });
  await admit();
  expect(render.mock.calls[0]![0]).not.toHaveProperty('framePresenter');
  expect(render.mock.calls[0]![0]).toHaveProperty('acquireGpuOutput', framePresenter.acquire);
  scheduler.dispose();
});
