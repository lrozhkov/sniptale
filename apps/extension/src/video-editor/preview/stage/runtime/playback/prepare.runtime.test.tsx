// @vitest-environment jsdom

import * as revision from '../../../../preview/cache/revision';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import type { VideoEditorPreviewPrepareRequest } from '../../../../contracts/preview-runtime';
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
  prepareSourceVoiceover,
}: {
  mode: 'cache' | 'live';
  prepareSourceVoiceover?: (request: VideoEditorPreviewPrepareRequest) => Promise<void>;
  playbackRange?: { end: number; start: number } | null;
  projectOverride?: typeof project;
}) {
  usePreviewStagePlaybackPreviewRuntime({
    ...(prepareSourceVoiceover ? { prepareSourceVoiceover } : {}),
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

it('reuses a completed cache for subsequent seeks until configuration changes', async () => {
  mocks.prepareCache.mockResolvedValue({ cachedVideo: null, outcome: 'frame-cache-ready' });
  await act(async () => root.render(<Harness mode="cache" />));
  const seek = (generation: number) =>
    runtime!.prepare({
      generation,
      isPlaying: false,
      playbackRange: null,
      reason: 'seek',
      signal: new AbortController().signal,
      time: generation / 10,
    });
  await act(async () => {
    await seek(1);
  });
  await act(async () => {
    await seek(2);
  });
  expect(mocks.prepareCache).toHaveBeenCalledOnce();
  await act(async () =>
    root.render(<Harness mode="cache" projectOverride={{ ...project, fps: 15 }} />)
  );
  await act(async () => {
    await seek(3);
  });
  expect(mocks.prepareCache).toHaveBeenCalledTimes(2);
});

it('waits for voice preparation before declaring the Native playback request ready', async () => {
  let resolve!: () => void;
  const prepareSourceVoiceover = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      })
  );
  await act(async () =>
    root.render(<Harness mode="live" prepareSourceVoiceover={prepareSourceVoiceover} />)
  );
  const request: VideoEditorPreviewPrepareRequest = {
    generation: 1,
    isPlaying: true,
    playbackRange: null,
    reason: 'play',
    signal: new AbortController().signal,
    time: 0,
  };
  let complete = false;
  const pending = runtime!.prepare(request).then((outcome) => {
    complete = true;
    return outcome;
  });
  await act(async () => Promise.resolve());
  expect(prepareSourceVoiceover).toHaveBeenCalledWith(
    expect.objectContaining({ time: 0, isPlaying: true, signal: expect.any(AbortSignal) })
  );
  expect(complete).toBe(false);
  await act(async () => {
    resolve();
    await pending;
  });
  expect(await pending).toBe('live-ready');
  prepareSourceVoiceover.mockClear();
  await act(async () => {
    await runtime!.prepare({ ...request, generation: 2, isPlaying: false, reason: 'seek' });
  });
  expect(prepareSourceVoiceover).not.toHaveBeenCalled();
});

it('cancels pending voice preparation through the existing runtime cancellation owner', async () => {
  let signal!: AbortSignal;
  const prepareSourceVoiceover = vi.fn((request: VideoEditorPreviewPrepareRequest) => {
    signal = request.signal;
    return new Promise<void>((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    );
  });
  await act(async () =>
    root.render(<Harness mode="live" prepareSourceVoiceover={prepareSourceVoiceover} />)
  );
  const pending = runtime!.prepare({
    generation: 1,
    isPlaying: true,
    playbackRange: null,
    reason: 'play',
    signal: new AbortController().signal,
    time: 0,
  });
  await act(async () => Promise.resolve());
  runtime!.cancel(1);
  expect(signal.aborted).toBe(true);
  expect(await pending).toBe('cancelled');
});

it('rejects current voice preparation failure instead of starting silent playback', async () => {
  const prepareSourceVoiceover = vi.fn(async () => {
    throw new Error('Voice unavailable');
  });
  await act(async () =>
    root.render(<Harness mode="live" prepareSourceVoiceover={prepareSourceVoiceover} />)
  );
  await expect(
    runtime!.prepare({
      generation: 1,
      isPlaying: true,
      playbackRange: null,
      reason: 'play',
      signal: new AbortController().signal,
      time: 0,
    })
  ).rejects.toThrow('Voice unavailable');
});

it.each(['resolve', 'reject'] as const)(
  'retries the current voice preparation when an older callback finishes by %s',
  async (finish) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const old = vi.fn(
      () =>
        new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        })
    );
    const current = vi.fn(async () => undefined);
    await act(async () => root.render(<Harness mode="live" prepareSourceVoiceover={old} />));
    const pending = runtime!.prepare({
      generation: 1,
      isPlaying: true,
      playbackRange: null,
      reason: 'play',
      signal: new AbortController().signal,
      time: 0,
    });
    await act(async () => Promise.resolve());
    await act(async () => root.render(<Harness mode="live" prepareSourceVoiceover={current} />));
    await act(async () => {
      if (finish === 'resolve') resolve();
      else reject(new Error('Old voice failed'));
      await pending;
    });
    expect(current).toHaveBeenCalledOnce();
    expect(await pending).toBe('live-ready');
  }
);

it('does not serialize live project replacements and retries stale voice preparation once', async () => {
  const identity = vi.spyOn(revision, 'createVideoPreviewRenderIdentity');
  let firstSignal!: AbortSignal;
  const voice = vi
    .fn()
    .mockImplementationOnce((request: VideoEditorPreviewPrepareRequest) => {
      firstSignal = request.signal;
      return new Promise<void>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason), {
          once: true,
        });
      });
    })
    .mockResolvedValue(undefined);
  try {
    await act(async () => root.render(<Harness mode="live" prepareSourceVoiceover={voice} />));
    expect(identity).not.toHaveBeenCalled();
    const pending = runtime!.prepare({
      generation: 1,
      isPlaying: true,
      playbackRange: null,
      reason: 'play',
      signal: new AbortController().signal,
      time: 0,
    });
    await act(async () => Promise.resolve());
    await act(async () =>
      root.render(
        <Harness mode="live" projectOverride={{ ...project }} prepareSourceVoiceover={voice} />
      )
    );
    expect(firstSignal.aborted).toBe(true);
    await expect(pending).resolves.toBe('live-ready');
    expect(voice).toHaveBeenCalledTimes(2);
    expect(identity).not.toHaveBeenCalled();
  } finally {
    identity.mockRestore();
  }
});
