// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';

type PreviewSceneInput = Parameters<
  typeof import('../stage/scene/render-preview').renderPreviewScene
>[0];
const renderPreviewScene = vi.hoisted(() =>
  vi.fn<(args: PreviewSceneInput) => Promise<void | false>>(async () => {})
);
const spatial = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: spatial.create,
}));

vi.mock('../stage/scene/render-preview', () => ({ renderPreviewScene }));

import { createVideoPreviewFrameMaterializer } from './materializer';

beforeEach(() => {
  renderPreviewScene.mockClear();
  spatial.create.mockReset();
});

function createVideoClip(trackId: string): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip 1',
    sourceDuration: 1,
    sourceStart: 0,
    startTime: 0,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}

function mockDelayedSeekVideo(): void {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    const element = originalCreateElement(tagName, options);
    if (tagName !== 'video') return element;
    const video = element as HTMLVideoElement;
    let currentTime = 0;
    let seekCount = 0;
    let seeking = false;
    Object.defineProperties(video, {
      currentTime: {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
          seeking = true;
          seekCount += 1;
          if (seekCount === 1) {
            window.setTimeout(() => {
              seeking = false;
            }, 20);
            window.setTimeout(() => video.dispatchEvent(new Event('seeked')), 80);
            return;
          }
          window.setTimeout(() => {
            seeking = false;
            video.dispatchEvent(new Event('seeked'));
          }, 100);
        },
      },
      load: { configurable: true, value: vi.fn() },
      pause: { configurable: true, value: vi.fn() },
      readyState: { configurable: true, value: 2 },
      seeking: { configurable: true, get: () => seeking },
    });
    return video;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('materializes a paused video when an intra-frame seek completes without a seeked event', async () => {
  vi.useFakeTimers();
  const project = createEmptyVideoProject('Cache seek');
  project.duration = 1;
  project.clips = [createVideoClip(project.tracks[0]!.id)];
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    const element = originalCreateElement(tagName, options);
    if (tagName !== 'video') return element;
    const video = element as HTMLVideoElement;
    let currentTime = 0;
    Object.defineProperties(video, {
      cancelVideoFrameCallback: { configurable: true, value: vi.fn() },
      currentTime: {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
        },
      },
      load: { configurable: true, value: vi.fn() },
      pause: { configurable: true, value: vi.fn() },
      readyState: { configurable: true, value: 2 },
      seeking: { configurable: true, value: false },
      requestVideoFrameCallback: { configurable: true, value: vi.fn(() => 1) },
    });
    return video;
  });
  const materializer = createVideoPreviewFrameMaterializer({
    assetUrls: { 'asset-1': 'blob:video' },
    ownerDocument: document,
    project,
    rasterSize: { height: 360, width: 640 },
  });
  expect(document.querySelector('video')?.isConnected).toBe(true);

  const pending = materializer.renderFrame(1 / project.fps, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(2_000);

  await expect(pending).resolves.toBe(materializer.canvas);
  expect(renderPreviewScene).toHaveBeenCalledOnce();
  materializer.dispose();
});

it('ignores a delayed seeked event from the previously materialized frame', async () => {
  vi.useFakeTimers();
  const project = createEmptyVideoProject('Delayed cache seek');
  project.duration = 1;
  project.clips = [createVideoClip(project.tracks[0]!.id)];
  mockDelayedSeekVideo();
  const materializer = createVideoPreviewFrameMaterializer({
    assetUrls: { 'asset-1': 'blob:video' },
    ownerDocument: document,
    project,
    rasterSize: { height: 360, width: 640 },
  });

  const firstFrame = materializer.renderFrame(1 / project.fps, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(40);
  await expect(firstFrame).resolves.toBe(materializer.canvas);

  const secondFrame = materializer.renderFrame(2 / project.fps, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(50);
  expect(renderPreviewScene).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(60);
  await expect(secondFrame).resolves.toBe(materializer.canvas);
  expect(renderPreviewScene).toHaveBeenCalledTimes(2);
  materializer.dispose();
});

it.each([
  { branch: 'load', readyState: 0 },
  { branch: 'seek', readyState: 2 },
])(
  'stops before $branch when cancellation precedes the media operation',
  async ({ readyState }) => {
    const controller = new AbortController();
    const project = createEmptyVideoProject('Cancelled cache seek');
    project.duration = 1;
    project.clips = [createVideoClip(project.tracks[0]!.id)];
    const load = vi.fn();
    const setCurrentTime = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      const element = originalCreateElement(tagName, options);
      if (tagName !== 'video') return element;
      const video = element as HTMLVideoElement;
      Object.defineProperties(video, {
        currentTime: {
          configurable: true,
          get: () => 0,
          set: setCurrentTime,
        },
        load: { configurable: true, value: load },
        pause: { configurable: true, value: vi.fn(() => controller.abort()) },
        readyState: { configurable: true, value: readyState },
        seeking: { configurable: true, value: false },
      });
      return video;
    });
    const materializer = createVideoPreviewFrameMaterializer({
      assetUrls: { 'asset-1': 'blob:video' },
      ownerDocument: document,
      project,
      rasterSize: { height: 360, width: 640 },
    });

    await expect(
      materializer.renderFrame(1 / project.fps, controller.signal)
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(load).not.toHaveBeenCalled();
    expect(setCurrentTime).not.toHaveBeenCalled();
    expect(renderPreviewScene).not.toHaveBeenCalled();
    materializer.dispose();
  }
);

it('reuses the decoded source and media element for camera-only redraws', async () => {
  vi.useFakeTimers();
  mockDelayedSeekVideo();
  const project = createEmptyVideoProject('Framing');
  project.duration = 1;
  project.clips = [createVideoClip(project.tracks[0]!.id)];
  const materializer = createVideoPreviewFrameMaterializer({
    project,
    ownerDocument: document,
    assetUrls: { 'asset-1': 'blob:source' },
    rasterSize: { width: 480, height: 270 },
  });
  const video = document.querySelector('video')!;
  const seek = vi.spyOn(video, 'currentTime', 'set');
  const signal = new AbortController().signal;
  const first = materializer.renderFrame(0.25, signal);
  await vi.advanceTimersByTimeAsync(120);
  await first;
  const cameraOverride = {
    scale: 0.5,
    focusPoint: { x: 960, y: 540 },
    regionId: 'region',
    motionBlurAmount: 0,
    viewportX: -960,
    viewportY: -540,
    viewportWidth: 3840,
    viewportHeight: 2160,
  };
  await materializer.renderFrame(0.25, signal, cameraOverride);
  expect(seek).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('video')).toHaveLength(1);
  expect(renderPreviewScene).toHaveBeenLastCalledWith(expect.objectContaining({ cameraOverride }));
  materializer.dispose();
});

function resourceFixture() {
  const project = createEmptyVideoProject('Spatial frame owner', 320, 180);
  project.duration = 2;
  return createVideoPreviewFrameMaterializer({
    project,
    ownerDocument: document,
    assetUrls: {},
    rasterSize: { width: 480, height: 270 },
  });
}

it('owns lazy reusable GPU and staging resources and ignores stale context-loss callbacks', async () => {
  const lost: (() => void)[] = [];
  const renderers: { dispose: ReturnType<typeof vi.fn> }[] = [];
  spatial.create.mockImplementation((onLost: () => void) => {
    lost.push(onLost);
    const renderer = { validateSizes: vi.fn(), surface: vi.fn(), draw: vi.fn(), dispose: vi.fn() };
    renderers.push(renderer);
    return renderer;
  });
  const createElement = vi.spyOn(document, 'createElement');
  const owner = resourceFixture();
  const initialCanvases = createElement.mock.calls.filter(([tag]) => tag === 'canvas').length;
  const signal = new AbortController().signal;
  await owner.renderFrame(0, signal);
  expect(spatial.create).not.toHaveBeenCalled();
  expect(createElement.mock.calls.filter(([tag]) => tag === 'canvas')).toHaveLength(
    initialCanvases
  );
  const first = renderPreviewScene.mock.lastCall![0];
  const renderer = first.spatialRenderer!();
  const staging = first.stagingCanvas!();
  staging.width = 480;
  staging.height = 270;
  await owner.renderFrame(0.1, signal);
  const second = renderPreviewScene.mock.lastCall![0];
  expect(second.spatialRenderer!()).toBe(renderer);
  expect(second.stagingCanvas!()).toBe(staging);
  expect(spatial.create).toHaveBeenCalledOnce();
  lost[0]!();
  expect(renderers[0]!.dispose).toHaveBeenCalledOnce();
  const replacement = second.spatialRenderer!();
  expect(replacement).not.toBe(renderer);
  expect(spatial.create).toHaveBeenCalledTimes(2);
  lost[0]!();
  expect(renderers[1]!.dispose).not.toHaveBeenCalled();
  expect(second.spatialRenderer!()).toBe(replacement);
  owner.dispose();
  owner.dispose();
  expect(renderers[1]!.dispose).toHaveBeenCalledOnce();
  expect(staging.width).toBe(0);
  expect(staging.height).toBe(0);
});

it('refuses delayed resource factories after abort or disposal without creating GPU or effects', async () => {
  const owner = resourceFixture();
  const controller = new AbortController();
  await owner.renderFrame(0, controller.signal);
  const first = renderPreviewScene.mock.lastCall![0];
  controller.abort();
  for (const factory of [first.spatialRenderer, first.stagingCanvas, first.effectRuntimeExecutor]) {
    expect(typeof factory).toBe('function');
    if (typeof factory === 'function')
      expect(() => factory()).toThrow(expect.objectContaining({ name: 'AbortError' }));
  }
  await owner.renderFrame(0.1, new AbortController().signal);
  const second = renderPreviewScene.mock.lastCall![0];
  owner.dispose();
  for (const factory of [
    second.spatialRenderer,
    second.stagingCanvas,
    second.effectRuntimeExecutor,
  ]) {
    expect(typeof factory).toBe('function');
    if (typeof factory === 'function')
      expect(() => factory()).toThrow(expect.objectContaining({ name: 'AbortError' }));
  }
  await expect(owner.renderFrame(0.2, new AbortController().signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(spatial.create).not.toHaveBeenCalled();
});

it('rejects a render that finishes after its materializer closes', async () => {
  const owner = resourceFixture();
  let release!: () => void, enter!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  renderPreviewScene.mockImplementationOnce(async () => {
    enter();
    await gate;
  });
  const pending = owner.renderFrame(0, new AbortController().signal);
  await entered;
  owner.dispose();
  release();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(spatial.create).not.toHaveBeenCalled();
});

it('does not admit a retained previous canvas as a newly rendered framing result', async () => {
  const owner = resourceFixture();
  renderPreviewScene.mockResolvedValueOnce(false);
  await expect(owner.renderFrame(0, new AbortController().signal)).rejects.toThrow(
    'Preview frame is unavailable.'
  );
  owner.dispose();
});

it('retains one watermark preparation owner across frames and clears it when the materializer closes', async () => {
  const owner = resourceFixture();
  await owner.renderFrame(0, new AbortController().signal);
  const prepared = renderPreviewScene.mock.lastCall![0].watermarkRenderer!;
  const clear = vi.spyOn(prepared, 'clear');
  await owner.renderFrame(0.1, new AbortController().signal);
  expect(renderPreviewScene.mock.lastCall![0].watermarkRenderer).toBe(prepared);
  owner.dispose();
  owner.dispose();
  expect(clear).toHaveBeenCalledTimes(1);
});
