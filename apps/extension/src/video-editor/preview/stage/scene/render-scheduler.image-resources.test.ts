// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPreviewSceneRenderScheduler, type PreviewSceneRenderJob } from './render-scheduler';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const admit = () => vi.advanceTimersByTimeAsync(20);
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

it('publishes a submitted frame when only its loaded header alias retires at the next clip', async () => {
  const completed = Promise.withResolvers<void>();
  const image = document.createElement('img');
  const first = createJob(1, true);
  first.previewRenderer = 'gpu';
  first.imageBank = { 'header:A': image };
  const onSuccess = vi.fn();
  const render = vi.fn(
    (input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]) => {
      const notify: unknown = Reflect.get(input, 'onImageResourcesPrepared');
      if (typeof notify === 'function')
        notify({
          images: { 'header:A': image },
          bindings: new Map([['header:A', image]]),
          headers: new Set(['header:A']),
        });
      input.onGpuSubmitted?.();
      return completed.promise;
    }
  );
  const scheduler = createPreviewSceneRenderScheduler({ render, onSuccess, onError: vi.fn() });
  try {
    scheduler.enqueue(first);
    scheduler.enqueue({
      ...first,
      currentTime: 1.02,
      imageBank: { 'header:B': image },
      controller: new AbortController(),
    });
    expect(first.controller.signal.aborted).toBe(false);
    completed.resolve();
    await admit();
    expect(onSuccess.mock.calls.some(([job]) => job === first)).toBe(true);
  } finally {
    completed.resolve();
    scheduler.dispose();
  }
});

it.each(['arrival', 'replacement', 'unrelated', 'retired', 'project'] as const)(
  'checks actual current-job image bindings for %s changes',
  async (kind) => {
    const completed = Promise.withResolvers<void>();
    const image = document.createElement('img');
    const first = createJob(4, true);
    first.previewRenderer = 'gpu';
    first.imageBank = { current: image };
    const render = vi.fn(
      (input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]) => {
        input.onImageResourcesPrepared?.({
          images: { current: image },
          bindings: new Map([['current', kind === 'arrival' ? undefined : image]]),
          headers: new Set(),
        });
        input.onGpuSubmitted?.();
        return completed.promise;
      }
    );
    const scheduler = createPreviewSceneRenderScheduler({ render, onError: vi.fn() });
    try {
      scheduler.enqueue(first);
      scheduler.enqueue({
        ...first,
        currentTime: 4.02,
        project: kind === 'project' ? { ...first.project } : first.project,
        imageBank:
          kind === 'replacement'
            ? { current: document.createElement('img') }
            : kind === 'retired'
              ? {}
              : { current: image, unrelated: document.createElement('img') },
        controller: new AbortController(),
      });
      expect(first.controller.signal.aborted).toBe(
        kind === 'arrival' || kind === 'replacement' || kind === 'project'
      );
    } finally {
      completed.resolve();
      scheduler.dispose();
    }
  }
);

it('checks the latest raw alias bank again before publishing a completed snapshot', async () => {
  const completion = Promise.withResolvers<void>();
  const first = createJob(7, true);
  first.previewRenderer = 'gpu';
  const image = document.createElement('img');
  first.imageBank = { needed: image };
  const latestBank = { needed: image };
  const onSuccess = vi.fn();
  const render = vi.fn(
    (input: Parameters<Parameters<typeof createPreviewSceneRenderScheduler>[0]['render']>[0]) => {
      input.onImageResourcesPrepared?.({
        images: { needed: image },
        bindings: new Map([['needed', image]]),
        headers: new Set(),
      });
      return completion.promise;
    }
  );
  const scheduler = createPreviewSceneRenderScheduler({ render, onSuccess, onError: vi.fn() });
  try {
    scheduler.enqueue(first);
    scheduler.enqueue({
      ...first,
      currentTime: 7.02,
      imageBank: latestBank,
      controller: new AbortController(),
    });
    latestBank.needed = document.createElement('img');
    completion.resolve();
    await admit();
    expect(onSuccess.mock.calls.some(([job]) => job === first)).toBe(false);
  } finally {
    completion.resolve();
    scheduler.dispose();
  }
});
