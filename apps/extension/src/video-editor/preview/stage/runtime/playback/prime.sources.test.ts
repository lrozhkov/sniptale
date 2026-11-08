// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePreviewStagePlaybackPreviewRuntime } from './prepare';
import { createVideoPreviewExactFrameCache } from '../../../cache/exact-frame-cache';
import type { PlaybackPreviewRuntime } from '../../../../interaction/playback/types';
import {
  createAudioClip,
  createProject,
  createVideoClip,
} from '../../../../../features/video/project/timeline/project-meta.test.helpers';
import type { NativePreviewSourceRuntime } from '../../media/source-runtime';
import { preparePreviewStagePlayback, type PreviewStagePlaybackPrepareState } from './prime';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => vi.unstubAllGlobals());

function state(sourceRuntime: NativePreviewSourceRuntime): PreviewStagePlaybackPrepareState {
  return {
    project: createProject([createVideoClip()]),
    sourceRuntime,
    audioBankClips: [],
    audioRefs: { current: {} },
    videoBankClips: [],
    videoRefs: { current: {} },
  };
}

function runtime(prepare: NativePreviewSourceRuntime['prepare']): NativePreviewSourceRuntime {
  return { selected: true, prepare, acquire: vi.fn(async () => null) };
}

it('waits for exact source readiness without an HTML video element', async () => {
  const gate = Promise.withResolvers<'ready' | 'retry'>();
  const prepare = vi.fn(() => gate.promise);
  const controller = new AbortController();
  let ready = false;
  const pending = preparePreviewStagePlayback(state(runtime(prepare)), 2, controller.signal).then(
    (value) => {
      ready = true;
      return value;
    }
  );
  await Promise.resolve();
  expect(prepare).toHaveBeenCalledWith(2, controller.signal);
  expect(ready).toBe(false);
  gate.resolve('ready');
  expect(await pending).toBe('ready');
});

it('returns retry before live-ready after an unsupported precise source', async () => {
  const prepare = vi.fn(async () => 'retry' as const);
  expect(await preparePreviewStagePlayback(state(runtime(prepare)), 2)).toBe('retry');
});

it('passes cancellation to the source owner and does not report readiness', async () => {
  const controller = new AbortController();
  const prepare = vi.fn(
    (_time: number, signal: AbortSignal) =>
      new Promise<'ready' | 'retry'>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
  );
  const pending = preparePreviewStagePlayback(state(runtime(prepare)), 2, controller.signal);
  await Promise.resolve();
  const error = new DOMException('Cancelled', 'AbortError');
  controller.abort(error);
  await expect(pending).rejects.toBe(error);
});

it('prepares the original audio through the existing owner after precise readiness', async () => {
  const gate = Promise.withResolvers<'ready' | 'retry'>();
  const prepare = vi.fn(() => gate.promise);
  const input = state(runtime(prepare));
  const clip = createAudioClip();
  const audio = document.createElement('audio');
  let audioTime = 0;
  const seek = vi.fn((value: number) => {
    audioTime = value;
  });
  const pause = vi.fn();
  Object.defineProperties(audio, {
    currentTime: { configurable: true, get: () => audioTime, set: seek },
    readyState: { configurable: true, value: 4 },
    pause: { configurable: true, value: pause },
  });
  input.audioBankClips = [clip];
  input.audioRefs.current[clip.id] = audio;
  const pending = preparePreviewStagePlayback(input, 2);
  await Promise.resolve();
  expect(seek).not.toHaveBeenCalled();
  gate.resolve('ready');
  expect(await pending).toBe('ready');
  expect(seek).toHaveBeenCalledExactlyOnceWith(2);
  expect(pause).toHaveBeenCalledOnce();
});

it('restores ordinary HTML priming when the source route is not selected', async () => {
  const prepare = vi.fn(async () => 'ready' as const);
  const input = state({ ...runtime(prepare), selected: false });
  const clip = createVideoClip();
  const video = document.createElement('video');
  let videoTime = 0;
  const seek = vi.fn((value: number) => {
    videoTime = value;
  });
  Object.defineProperties(video, {
    currentTime: { configurable: true, get: () => videoTime, set: seek },
    readyState: { configurable: true, value: 4 },
    duration: { configurable: true, value: 8 },
    pause: { configurable: true, value: vi.fn() },
  });
  input.videoBankClips = [clip];
  input.videoRefs.current[clip.id] = video;
  expect(await preparePreviewStagePlayback(input, 2)).toBe('ready');
  expect(prepare).not.toHaveBeenCalled();
  expect(seek).toHaveBeenCalledExactlyOnceWith(2);
});

it('propagates a selected decoder failure without declaring a compatible frame ready', async () => {
  const error = new Error('Preview source could not be decoded.');
  const prepare = vi.fn(async () => {
    throw error;
  });
  await expect(preparePreviewStagePlayback(state(runtime(prepare)), 2)).rejects.toBe(error);
});

it('retries the mounted preparation after compatibility banking commits and waits for HTML readiness', async () => {
  vi.useFakeTimers();
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const clip = createVideoClip();
  const project = createProject([clip]);
  const video = document.createElement('video');
  let readyState = 0;
  let videoTime = 0;
  const seek = vi.fn((time: number) => {
    videoTime = time;
  });
  Object.defineProperties(video, {
    readyState: { configurable: true, get: () => readyState },
    currentTime: { configurable: true, get: () => videoTime, set: seek },
    duration: { configurable: true, value: 8 },
    pause: { configurable: true, value: vi.fn() },
  });
  let useCompatibility = () => {};
  const prepare = vi.fn(async () => {
    useCompatibility();
    return 'retry' as const;
  });
  const precise = runtime(prepare);
  const compatible = { ...precise, selected: false };
  let playback: PlaybackPreviewRuntime | null = null;
  const cache = createVideoPreviewExactFrameCache(1024 * 1024);
  const refs = { current: { [clip.id]: video } };
  const generation = { current: 0 };
  function Harness() {
    const [selected, setSelected] = useState(true);
    useCompatibility = () => setSelected(false);
    usePreviewStagePlaybackPreviewRuntime({
      project,
      sourceRuntime: selected ? precise : compatible,
      assetUrls: {},
      audioBankClips: [],
      audioRefs: { current: {} },
      videoBankClips: selected ? [] : [clip],
      videoRefs: refs,
      previewMode: 'live',
      previewRenderer: 'gpu',
      previewExactFrameCache: cache,
      previewRasterSize: { width: 1280, height: 720 },
      playbackRange: null,
      renderGenerationRef: generation,
      onPresentationTime: vi.fn(),
      registerPreviewRuntime: (value) => {
        playback = value;
      },
    });
    return null;
  }
  const container = document.createElement('div');
  const mounted = createRoot(container);
  await act(async () => mounted.render(createElement(Harness)));
  let outcome: string | undefined;
  const pending = playback!
    .prepare({
      generation: 1,
      isPlaying: true,
      playbackRange: null,
      reason: 'play',
      signal: new AbortController().signal,
      time: 2,
    })
    .then((value) => {
      outcome = value;
      return value;
    });
  try {
    for (let index = 0; index < 4 && frames.length; index++) {
      const callback = frames.shift()!;
      await act(async () => callback(0));
    }
    expect(prepare).toHaveBeenCalled();
    expect(seek).toHaveBeenCalledExactlyOnceWith(2);
    expect(outcome).toBeUndefined();
    readyState = 4;
    await act(async () => {
      video.dispatchEvent(new Event('loadeddata'));
      await pending;
    });
    expect(outcome).toBe('live-ready');
  } finally {
    await act(async () => mounted.unmount());
    container.remove();
    vi.useRealTimers();
  }
});

it('cancels an in-progress precise source through the actual playback runtime', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const prepare = vi.fn(
    (_time: number, signal: AbortSignal) =>
      new Promise<'ready' | 'retry'>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
  );
  const source = runtime(prepare);
  let playback: PlaybackPreviewRuntime | null = null;
  const project = createProject([createVideoClip()]);
  const cache = createVideoPreviewExactFrameCache(1024 * 1024);
  function Harness() {
    usePreviewStagePlaybackPreviewRuntime({
      project,
      sourceRuntime: source,
      assetUrls: {},
      audioBankClips: [],
      audioRefs: { current: {} },
      videoBankClips: [],
      videoRefs: { current: {} },
      previewMode: 'live',
      previewRenderer: 'gpu',
      previewExactFrameCache: cache,
      previewRasterSize: { width: 1280, height: 720 },
      playbackRange: null,
      renderGenerationRef: { current: 0 },
      onPresentationTime: vi.fn(),
      registerPreviewRuntime: (value) => {
        playback = value;
      },
    });
    return null;
  }
  const container = document.createElement('div');
  const mounted = createRoot(container);
  await act(async () => mounted.render(createElement(Harness)));
  const pending = playback!.prepare({
    generation: 1,
    isPlaying: true,
    playbackRange: null,
    reason: 'seek',
    signal: new AbortController().signal,
    time: 2,
  });
  try {
    await act(async () => frames.shift()!(0));
    expect(prepare).toHaveBeenCalledOnce();
    act(() => playback!.cancel(1));
    expect(await pending).toBe('cancelled');
  } finally {
    await act(async () => mounted.unmount());
    container.remove();
  }
});
