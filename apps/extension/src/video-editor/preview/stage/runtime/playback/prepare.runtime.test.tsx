// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import type { PlaybackPreviewRuntime } from '../../../../interaction/playback/types';
import { createVideoPreviewExactFrameCache } from '../../../../preview/cache/exact-frame-cache';

const mocks = vi.hoisted(() => ({
  prepareCache: vi.fn(),
}));

vi.mock('../../../../preview/cache/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../preview/cache/runtime')>()),
  buildVideoPreviewCache: mocks.prepareCache,
}));

import { usePreviewStagePlaybackPreviewRuntime } from './prepare';

const project = createEmptyVideoProject('Runtime');
const exactFrameCache = createVideoPreviewExactFrameCache(1024);
const registerPreviewRuntime = vi.fn();
const onPresentationTime = vi.fn();
const renderGenerationRef = { current: 0 };
let container: HTMLDivElement;
let root: Root;
let runtime: PlaybackPreviewRuntime | null;

function capturePreviewRuntime(next: PlaybackPreviewRuntime | null): void {
  runtime = next;
  registerPreviewRuntime(next);
}

function Harness({
  mode,
  playbackRange = null,
  projectOverride = project,
}: {
  mode: 'cache' | 'live';
  playbackRange?: { end: number; start: number } | null;
  projectOverride?: typeof project;
}) {
  usePreviewStagePlaybackPreviewRuntime({
    assetUrls: {},
    audioBankClips: [],
    audioRefs: { current: {} },
    previewExactFrameCache: exactFrameCache,
    previewMode: mode,
    onPresentationTime,
    playbackRange,
    previewRasterSize: { height: 1440, width: 2560 },
    project: projectOverride,
    renderGenerationRef,
    registerPreviewRuntime: capturePreviewRuntime,
    videoBankClips: [],
    videoRefs: { current: {} },
  });
  return null;
}

beforeEach(() => {
  runtime = null;
  renderGenerationRef.current = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  registerPreviewRuntime.mockClear();
  onPresentationTime.mockClear();
  mocks.prepareCache.mockReset().mockImplementation(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('configuration changed', 'AbortError')),
          { once: true }
        );
      })
  );
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

it('forwards direct presentation and settle times through the mounted preview runtime', async () => {
  await act(async () => root.render(<Harness mode="live" />));

  act(() => {
    runtime!.present(1 / 60);
    runtime!.settle(2 / 60);
  });

  expect(onPresentationTime.mock.calls.map(([time]) => time)).toEqual([1 / 60, 2 / 60]);
});

it('advances the render generation before preparing a playing seek', async () => {
  await act(async () => root.render(<Harness mode="live" />));
  onPresentationTime.mockImplementationOnce(() => {
    expect(renderGenerationRef.current).toBe(1);
  });

  await act(async () => {
    await runtime!.prepare({
      generation: 1,
      isPlaying: true,
      playbackRange: null,
      reason: 'seek',
      signal: new AbortController().signal,
      time: 1,
    });
  });

  expect(renderGenerationRef.current).toBe(1);
});

it('reports a failed cache build separately from unavailable browser capability', async () => {
  mocks.prepareCache.mockRejectedValueOnce(new Error('materializer failed'));
  await act(async () => root.render(<Harness mode="cache" />));
  const statuses: Array<{ outcome?: string; phase: string }> = [];
  const unsubscribe = runtime!.subscribe((status) => statuses.push(status));

  let outcome: Awaited<ReturnType<PlaybackPreviewRuntime['prepare']>> | undefined;
  await act(async () => {
    outcome = await runtime!.prepare({
      generation: 1,
      isPlaying: true,
      playbackRange: null,
      reason: 'play',
      signal: new AbortController().signal,
      time: 0,
    });
  });

  expect(outcome).toBe('failed');
  expect(statuses.at(-1)).toMatchObject({ outcome: 'failed', phase: 'recovering' });
  unsubscribe();
});

it('aborts stale cache preparation and restarts the request for a changed playback range', async () => {
  mocks.prepareCache
    .mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('range changed', 'AbortError')),
            { once: true }
          );
        })
    )
    .mockResolvedValueOnce({ cachedVideo: null, outcome: 'frame-cache-ready' });
  await act(async () => root.render(<Harness mode="cache" />));
  const preparation = runtime!.prepare({
    generation: 1,
    isPlaying: true,
    playbackRange: null,
    reason: 'play',
    signal: new AbortController().signal,
    time: 0,
  });
  await act(async () => Promise.resolve());

  await act(async () => root.render(<Harness mode="cache" playbackRange={{ start: 1, end: 2 }} />));
  let outcome: Awaited<typeof preparation> | undefined;
  await act(async () => {
    outcome = await preparation;
  });

  expect(outcome).toBe('frame-cache-ready');
  expect(mocks.prepareCache).toHaveBeenCalledTimes(2);
  expect(mocks.prepareCache).toHaveBeenLastCalledWith(
    expect.objectContaining({ playbackRange: { start: 1, end: 2 } })
  );
});

it('keeps one preparation when the project is rehydrated with identical render content', async () => {
  let resolvePreparation!: (value: { cachedVideo: null; outcome: 'frame-cache-ready' }) => void;
  mocks.prepareCache.mockImplementationOnce(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((resolve, reject) => {
        resolvePreparation = resolve;
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('identity-only project update', 'AbortError')),
          { once: true }
        );
      })
  );
  await act(async () => root.render(<Harness mode="cache" />));
  const preparation = runtime!.prepare({
    generation: 1,
    isPlaying: true,
    playbackRange: null,
    reason: 'play',
    signal: new AbortController().signal,
    time: 0,
  });
  await act(async () => Promise.resolve());
  const activeSignal = mocks.prepareCache.mock.calls[0]?.[0].signal as AbortSignal;

  await act(async () => root.render(<Harness mode="cache" projectOverride={{ ...project }} />));

  expect(activeSignal.aborted).toBe(false);
  resolvePreparation({ cachedVideo: null, outcome: 'frame-cache-ready' });
  await expect(preparation).resolves.toBe('frame-cache-ready');
  expect(mocks.prepareCache).toHaveBeenCalledOnce();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('aborts stale cache preparation and completes the same play request in the new Live mode', async () => {
  await act(async () => root.render(<Harness mode="cache" />));
  const controller = new AbortController();
  const preparation = runtime!.prepare({
    generation: 1,
    isPlaying: true,
    playbackRange: null,
    reason: 'play',
    signal: controller.signal,
    time: 0,
  });
  await act(async () => Promise.resolve());
  expect(mocks.prepareCache).toHaveBeenCalledOnce();

  let outcome: Awaited<typeof preparation> | undefined;
  await act(async () => root.render(<Harness mode="live" />));
  await act(async () => {
    outcome = await preparation;
  });

  expect(outcome).toBe('live-ready');
  expect(mocks.prepareCache.mock.calls[0]?.[0].signal.aborted).toBe(true);
});
