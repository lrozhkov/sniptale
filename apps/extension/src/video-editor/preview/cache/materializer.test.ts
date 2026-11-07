// @vitest-environment jsdom
import * as nativeGpu from '../stage/scene/gpu-preview';
import { createVideoEditorEffectPreparationExecutor } from '../../runtime/effect-runtime';
import type { NativePreviewGpuTargetFactory, PreviewScenePresentation } from '../stage/scene/types';
import type { GpuPreviewRenderer } from '../../../features/video/composition/canvas/gpu-preview';
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import { drawVideoProjectSceneEdges } from '../../../features/video/composition/canvas/scene-edges';
import { createImageClip } from '../../../features/video/project/timeline/project-meta.test.helpers';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
  type VideoProject,
} from '../../../features/video/project/types';

type PreviewSceneInput = Parameters<
  typeof import('../stage/scene/render-preview').renderPreviewScene
>[0];
const renderPreviewScene = vi.hoisted(() =>
  vi.fn<(args: PreviewSceneInput) => Promise<void | false | PreviewScenePresentation>>(
    async () => {}
  )
);
const cut = vi.hoisted(() => ({
  create: vi.fn(),
  sample: vi.fn(),
  release: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../../workflows/video-review/decoded-video-sample', () => ({
  createCompositionCutSampleSource: () => {
    cut.create();
    return { sample: cut.sample, dispose: cut.dispose };
  },
}));
const spatial = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: spatial.create,
}));

vi.mock('../stage/scene/render-preview', async () => {
  const { resolveVideoCompositionFrame } =
    await import('../../../features/video/composition/timeline/frame');
  return {
    renderPreviewScene: async (
      input: Parameters<typeof import('../stage/scene/render-preview').renderPreviewScene>[0]
    ) => {
      const result = await renderPreviewScene(input);
      return result === false
        ? false
        : (result ?? {
            camera:
              input.cameraOverride ??
              resolveVideoCompositionFrame(input.project, input.currentTime).camera,
            time: input.currentTime,
          });
    },
  };
});

import { createVideoPreviewFrameMaterializer } from './materializer';

beforeEach(() => {
  renderPreviewScene.mockClear();
  cut.create.mockClear();
  cut.sample.mockClear();
  cut.release.mockClear();
  cut.dispose.mockClear();
  cut.sample.mockResolvedValue({ media: new Map(), release: cut.release });
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
  const pending = materializer.renderFrame(1 / project.fps, new AbortController().signal);
  expect(document.querySelector('video')?.isConnected).toBe(true);
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
  const signal = new AbortController().signal;
  const first = materializer.renderFrame(0.25, signal);
  await vi.advanceTimersByTimeAsync(120);
  await first;
  const video = document.querySelector('video')!;
  expect(video.currentTime).toBe(0.25);
  const seek = vi.spyOn(video, 'currentTime', 'set');
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
  expect(seek).not.toHaveBeenCalled();
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
  expect(spatial.create.mock.calls[0]?.[1]).toBeDefined();
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

function compositionFixture(type: 'dissolve' | 'fade-black' = 'dissolve', splitAt?: number) {
  const project = createEmptyVideoProject('Whole composition');
  project.fps = 4;
  project.duration = 2;
  project.clips = [createImageClip({ id: 'intro', trackId: project.tracks[0]!.id, duration: 1 })];
  project.compositionJoins = [
    {
      id: 'join',
      clipId: 'intro',
      edge: 'end',
      transition: { type, before: 0.5, after: 0.5, color: '#ffffff' },
    },
  ];
  if (splitAt !== undefined) {
    const intro = project.clips[0]!;
    project.clips = [
      { ...intro, duration: splitAt },
      { ...intro, id: 'intro-tail', startTime: splitAt, duration: 1 - splitAt },
    ];
    project.compositionJoins[0]!.clipId = 'intro-tail';
  }
  const completedScene = async (input: PreviewSceneInput) => {
    const context = input.canvas.getContext('2d')!;
    context.fillStyle = input.currentTime < 1 ? '#ff0000' : '#0000ff';
    context.fillRect(0, 0, 8, 4);
    context.fillStyle = '#00ff00';
    context.fillRect(6, 0, 2, 2);
    if (input.sceneEdges !== 'omit')
      drawVideoProjectSceneEdges(context, input.project, input.currentTime);
  };
  renderPreviewScene.mockImplementation(completedScene);
  const owner = createVideoPreviewFrameMaterializer({
    assetUrls: {},
    ownerDocument: document,
    project,
    rasterSize: { width: 8, height: 4 },
  });
  return {
    project,
    owner,
    completedScene,
    pixel: (x = 0, y = 0) =>
      Array.from(owner.canvas.getContext('2d')!.getImageData(x, y, 1, 1).data),
  };
}

it('materializes complete held compositions and applies outer fades exactly once after the mix', async () => {
  const f = compositionFixture();
  f.project.sceneEdges = {
    intro: { enabled: true, duration: 2 },
    outro: { enabled: false, duration: 0.4 },
  };
  await f.owner.renderFrame(1, new AbortController().signal);
  expect(renderPreviewScene.mock.calls.map(([input]) => input.currentTime)).toEqual([0.75, 1]);
  expect(renderPreviewScene.mock.calls.every(([input]) => input.sceneEdges === 'omit')).toBe(true);
  const color = f.pixel();
  // At 4 fps the last frame is 1.75 s. The mixed frame at 1 s has gain 1 / 1.75.
  expect(Math.abs(color[0]! - 73)).toBeLessThanOrEqual(1);
  expect(color[1]).toBe(0);
  expect(Math.abs(color[2]! - 73)).toBeLessThanOrEqual(1);
  expect(Math.abs(f.pixel(7, 0)[1]! - 146)).toBeLessThanOrEqual(1);
  await f.owner.renderFrame(1.1, new AbortController().signal);
  expect(renderPreviewScene).toHaveBeenCalledTimes(2);
  f.owner.dispose();
});

it('materializes a color join from the current whole scene rather than held endpoint frames', async () => {
  const f = compositionFixture('fade-black');
  await f.owner.renderFrame(1.25, new AbortController().signal);
  expect(renderPreviewScene.mock.calls.map(([input]) => input.currentTime)).toEqual([1.25]);
  expect(renderPreviewScene.mock.calls[0]![0].sceneEdges).toBe('omit');
  expect(f.pixel()).toEqual([128, 128, 255, 255]);
  await f.owner.renderFrame(1.5, new AbortController().signal);
  expect(renderPreviewScene.mock.lastCall![0].sceneEdges).toBeUndefined();
  f.owner.dispose();
});

it('retries failed endpoint preparation and cancels publication when the materializer closes', async () => {
  const f = compositionFixture();
  renderPreviewScene
    .mockImplementationOnce(f.completedScene)
    .mockRejectedValueOnce(new Error('endpoint failed'));
  await expect(f.owner.renderFrame(1, new AbortController().signal)).rejects.toThrow(
    'endpoint failed'
  );
  await f.owner.renderFrame(1, new AbortController().signal);
  expect(renderPreviewScene.mock.calls.map(([input]) => input.currentTime)).toEqual([
    0.75, 1, 0.75, 1,
  ]);
  const controller = new AbortController();
  controller.abort();
  await expect(f.owner.renderFrame(1.1, controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  f.owner.dispose();
  expect(document.body.children).toHaveLength(0);
  await expect(f.owner.renderFrame(1.1, new AbortController().signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it('keeps unrelated frames available when a join has no sample', async () => {
  const project = createEmptyVideoProject('Sparse cadence');
  project.fps = 1;
  project.duration = 2.2;
  project.clips = [
    createImageClip({ id: 'intro', duration: 1.1 }),
    createImageClip({ id: 'outro', startTime: 1.2, duration: 1 }),
  ];
  project.compositionJoins = [
    {
      id: 'join',
      clipId: 'intro',
      edge: 'end',
      transition: { type: 'dissolve', before: 0.4, after: 0.4 },
    },
    { id: 'limit', clipId: 'outro', edge: 'start' },
  ];
  renderPreviewScene.mockImplementation(async () => {});
  const owner = createVideoPreviewFrameMaterializer({
    assetUrls: {},
    ownerDocument: document,
    project,
    rasterSize: { width: 8, height: 4 },
  });
  await owner.renderFrame(0.2, new AbortController().signal);
  await expect(owner.renderFrame(1.1, new AbortController().signal)).rejects.toThrow(
    'no output frame'
  );
  await owner.renderFrame(0.2, new AbortController().signal);
  expect(renderPreviewScene.mock.calls.map(([input]) => input.currentTime)).toEqual([0.2, 0.2]);
  owner.dispose();
});

it('uses the explicitly selected sample fps without changing the accepted project cadence', async () => {
  const f = compositionFixture();
  f.owner.dispose();
  const owner = createVideoPreviewFrameMaterializer({
    assetUrls: {},
    ownerDocument: document,
    project: f.project,
    rasterSize: { width: 8, height: 4 },
    sampleFps: 8,
  });
  await owner.renderFrame(1, new AbortController().signal);
  expect(renderPreviewScene.mock.calls.map(([input]) => input.currentTime)).toEqual([0.875, 1]);
  expect(f.project.fps).toBe(4);
  owner.dispose();
});

it('samples the complete region across a short split tail at the project cadence', async () => {
  const f = compositionFixture('dissolve', 0.95);
  try {
    await f.owner.renderFrame(0.8, new AbortController().signal);
    expect(renderPreviewScene.mock.calls.map(([input]) => input.currentTime)).toEqual([0.75, 1]);
    const center = f.pixel();
    for (const [index, expected] of [179, 0, 77, 255].entries())
      expect(Math.abs(center[index]! - expected)).toBeLessThanOrEqual(1);
  } finally {
    f.owner.dispose();
  }
});

it('materializes the moving cut side without rounding scene clocks to preview cadence', async () => {
  const f = compositionFixture();
  f.project.compositionJoins![0]!.sampling = 'cut';
  f.project.version = 40;
  await f.owner.renderFrame(0.85, new AbortController().signal);
  expect(renderPreviewScene.mock.calls.map(([input]) => input.currentTime)).toEqual([0.85, 1]);
  renderPreviewScene.mockClear();
  await f.owner.renderFrame(1.1, new AbortController().signal);
  const clocks = renderPreviewScene.mock.calls.map(([input]) => input.currentTime);
  const outgoing = clocks[0];
  if (outgoing === undefined) throw new Error('Missing outgoing cut frame');
  expect(outgoing).toBeLessThan(1);
  expect(1 - outgoing).toBeLessThanOrEqual(Number.EPSILON);
  expect(clocks[1]).toBe(1.1);
  expect(cut.sample.mock.calls.map(([time, _signal, fallback]) => [time, fallback])).toEqual([
    [0.85, 'last'],
    [1, 'first'],
    [outgoing, 'last'],
    [1.1, 'first'],
  ]);
  expect(cut.release).toHaveBeenCalledTimes(4);
  expect(
    renderPreviewScene.mock.calls.every(([input]) => input.decodedVideoFrames instanceof Map)
  ).toBe(true);
  expect(f.project.duration).toBe(2);
  f.owner.dispose();
  expect(cut.dispose).toHaveBeenCalledOnce();
});

it.each([
  ['dissolve', 'dissolve', 2, [34, 153, 68]],
  ['fade-black', 'dissolve', 2, [0, 153, 0]],
  ['dissolve', 'fade-black', 1.8, [113, 0, 57]],
  ['fade-black', 'fade-black', 1.8, [85, 0, 0]],
] as const)(
  'composes inner %s beneath outer %s without changing either authored window',
  async (inner, outer, time, expected) => {
    const project = createEmptyVideoProject('Nested composition');
    const base = createImageClip({ trackId: project.tracks[0]!.id });
    project.clips = [
      { ...base, id: 'intro', startTime: 0, duration: 1 },
      { ...base, id: 'left', startTime: 1, duration: 0.9 },
      { ...base, id: 'right', startTime: 1.9, duration: 0.1 },
      { ...base, id: 'outro', startTime: 2, duration: 1 },
    ];
    project.duration = 3;
    project.fps = 10;
    project.compositionJoins = [
      {
        id: 'intro',
        clipId: 'intro',
        edge: 'end',
        transition: { type: 'dissolve', before: 0.2, after: 0.3 },
      },
      {
        id: 'cut',
        clipId: 'right',
        edge: 'start',
        sampling: 'cut',
        transition: { type: inner, before: 0.2, after: 0.1 },
      },
      {
        id: 'outro',
        clipId: 'outro',
        edge: 'start',
        transition: { type: outer, before: 0.3, after: 0.2 },
      },
    ];
    renderPreviewScene.mockImplementation(async (input) => {
      const context = input.canvas.getContext('2d')!;
      context.clearRect(0, 0, 8, 4);
      context.fillStyle =
        input.currentTime < 1.9 ? '#ff0000' : input.currentTime < 2 ? '#0000ff' : '#00ff00';
      context.fillRect(0, 0, 8, 4);
      if (input.sceneEdges !== 'omit')
        drawVideoProjectSceneEdges(context, input.project, input.currentTime);
    });
    const owner = createVideoPreviewFrameMaterializer({
      project,
      assetUrls: {},
      ownerDocument: document,
      rasterSize: { width: 8, height: 4 },
    });
    const pixel = () => Array.from(owner.canvas.getContext('2d')!.getImageData(4, 2, 1, 1).data);
    try {
      renderPreviewScene.mockRejectedValueOnce(new Error('nested sample failed'));
      await expect(owner.renderFrame(time, new AbortController().signal)).rejects.toThrow(
        'nested sample failed'
      );
      await owner.renderFrame(time, new AbortController().signal);
      for (const [channel, value] of expected.entries())
        expect(Math.abs(pixel()[channel]! - value)).toBeLessThanOrEqual(2);
      project.sceneEdges = {
        intro: { enabled: true, duration: 3 },
        outro: { enabled: false, duration: 0.4 },
      };
      await owner.renderFrame(time, new AbortController().signal);
      for (const [channel, value] of expected.entries())
        expect(Math.abs(pixel()[channel]! - Math.round((value * time) / 2.9))).toBeLessThanOrEqual(
          2
        );
      expect(cut.sample).toHaveBeenCalled();
    } finally {
      owner.dispose();
    }
    expect(cut.dispose).toHaveBeenCalledTimes(2);
    expect(document.body.children).toHaveLength(0);
  }
);

it.each(['none', 'dissolve', 'fade-black'] as const)(
  'uses output cadence for final scene fades through %s materialization',
  async (join) => {
    for (const sampleFps of [24, 60]) {
      const project = createEmptyVideoProject('Output cadence');
      project.fps = 30;
      project.duration = 1;
      project.clips = [
        createImageClip({ id: 'left', trackId: project.tracks[0]!.id, duration: 0.5 }),
        createImageClip({
          id: 'right',
          trackId: project.tracks[0]!.id,
          startTime: 0.5,
          duration: 0.5,
        }),
      ];
      project.sceneEdges = {
        intro: { enabled: false, duration: 0.4 },
        outro: { enabled: true, duration: 0.4, color: '#000000' },
      };
      if (join !== 'none')
        project.compositionJoins = [
          {
            id: 'estimate',
            clipId: 'left',
            edge: 'end',
            transition: { type: join, before: 0.5, after: 0.5, color: '#ffffff' },
          },
        ];
      renderPreviewScene.mockImplementation(async (input) => {
        const context = input.canvas.getContext('2d')!;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 8, 4);
        if (input.sceneEdges !== 'omit')
          drawVideoProjectSceneEdges(
            context,
            input.project,
            input.currentTime,
            undefined,
            input.sampleFps
          );
      });
      const owner = createVideoPreviewFrameMaterializer({
        assetUrls: {},
        ownerDocument: document,
        project,
        sampleFps,
        rasterSize: { width: 8, height: 4 },
      });
      try {
        const signal = new AbortController().signal;
        await owner.renderFrame((sampleFps - 2) / sampleFps, signal);
        const expected = sampleFps === 24 ? 27 : 11;
        const preceding = owner.canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data;
        for (const channel of preceding.slice(0, 3))
          expect(Math.abs(channel - expected)).toBeLessThanOrEqual(1);
        await owner.renderFrame((sampleFps - 1) / sampleFps, signal);
        expect(Array.from(owner.canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([
          0, 0, 0, 255,
        ]);
      } finally {
        owner.dispose();
      }
    }
  }
);

it('materializes a windowed video with the bounded decoder outside composition joins', async () => {
  mockDelayedSeekVideo();
  const project = createEmptyVideoProject('Held preview');
  const clip = createVideoClip(project.tracks[0]!.id);
  clip.duration = 1.2;
  clip.playbackWindow = { offset: 0, holdAt: 1 };
  project.clips = [clip];
  const source = { sourceWidth: 16, sourceHeight: 16, draw: vi.fn() };
  const decoded = new Map([[clip.id, source]]);
  cut.sample.mockResolvedValue({ media: decoded, release: cut.release });
  const materializer = createVideoPreviewFrameMaterializer({
    project,
    assetUrls: { 'asset-1': 'blob:held' },
    ownerDocument: document,
    rasterSize: { width: 16, height: 9 },
  });
  await materializer.renderFrame(1.1, new AbortController().signal);
  expect(cut.sample).toHaveBeenCalledWith(1.1, expect.any(AbortSignal), 'last', project);
  expect(renderPreviewScene.mock.lastCall?.[0].decodedVideoFrames).toBe(decoded);
  expect(cut.release).toHaveBeenCalledOnce();
  materializer.dispose();
  expect(cut.dispose).toHaveBeenCalledOnce();
});

it('recomposes held join endpoints from the new snapshot without replacing media', async () => {
  const f = compositionFixture();
  f.project.compositionJoins![0]!.sampling = 'cut';
  renderPreviewScene.mockImplementation(async ({ canvas, project }) => {
    const context = canvas.getContext('2d')!;
    context.fillStyle = project.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  });
  await f.owner.renderFrame(1, new AbortController().signal);
  const before = f.pixel();
  const next = { ...f.project, backgroundColor: '#00ff00' };
  expect(f.owner.updateProject(next)).toBe(true);
  await f.owner.renderFrame(1, new AbortController().signal);
  expect(f.pixel()).toEqual([0, 255, 0, 255]);
  expect(f.pixel()).not.toEqual(before);
  expect(renderPreviewScene).toHaveBeenCalledTimes(4);
  expect(renderPreviewScene.mock.calls.slice(2).every(([input]) => input.project === next)).toBe(
    true
  );
  expect(cut.create).toHaveBeenCalledOnce();
  expect(cut.dispose).not.toHaveBeenCalled();
  f.owner.dispose();
  expect(cut.dispose).toHaveBeenCalledOnce();
});

it('retains windowed media and renderer owners while accepting a new visual snapshot', async () => {
  mockDelayedSeekVideo();
  const project = createEmptyVideoProject('Windowed edits');
  const clip = createVideoClip(project.tracks[0]!.id);
  clip.playbackWindow = { offset: 0, holdAt: 0.9 };
  project.clips = [clip];
  const owner = createVideoPreviewFrameMaterializer({
    project,
    assetUrls: { 'asset-1': 'blob:held' },
    ownerDocument: document,
    rasterSize: { width: 16, height: 9 },
  });
  await owner.renderFrame(0.5, new AbortController().signal);
  const first = renderPreviewScene.mock.lastCall![0];
  const video = first.videoRefs.current[clip.id];
  const next = {
    ...project,
    backgroundColor: '#00ff00',
    clips: [{ ...clip, transform: { ...clip.transform, x: 20 } }],
  };
  expect(owner.updateProject(next)).toBe(true);
  await owner.renderFrame(0.5, new AbortController().signal);
  const second = renderPreviewScene.mock.lastCall![0];
  expect(second.project).toBe(next);
  expect(second.videoRefs.current[clip.id]).toBe(video);
  expect(second.captionRenderer).toBe(first.captionRenderer);
  expect(second.watermarkRenderer).toBe(first.watermarkRenderer);
  expect(cut.sample).toHaveBeenLastCalledWith(0.5, expect.any(AbortSignal), 'last', next);
  expect(cut.create).toHaveBeenCalledOnce();
  expect(cut.dispose).not.toHaveBeenCalled();
  expect(owner.updateProject({ ...next, id: 'different-project' })).toBe(false);
  expect(owner.updateProject({ ...next, clips: [{ ...clip, sourceStart: 0.2 }] })).toBe(false);
  expect(owner.updateProject({ ...next, clips: [{ ...clip, assetId: 'different-asset' }] })).toBe(
    false
  );
  owner.dispose();
  owner.dispose();
  expect(cut.dispose).toHaveBeenCalledOnce();
});

it('refuses snapshot replacement until an active frame settles', async () => {
  const f = compositionFixture();
  const pending = Promise.withResolvers<void>();
  renderPreviewScene.mockReturnValueOnce(pending.promise);
  const rendering = f.owner.renderFrame(1, new AbortController().signal);
  expect(f.owner.updateProject({ ...f.project, backgroundColor: '#00ff00' })).toBe(false);
  pending.resolve();
  await rendering;
  expect(f.owner.updateProject({ ...f.project, backgroundColor: '#00ff00' })).toBe(true);
  f.owner.dispose();
});

it('passes prepared recording facts to the scene and clears their reader with the materializer', async () => {
  const eventsOwner = await import('../../../workflows/video-review/recording-events');
  const { attachRecordingEventGroups, recordingEventProjectActions } =
    await import('../../../features/video/project/recording-events/project-facts');
  const clear = vi.fn();
  const project = createEmptyVideoProject('Events frame');
  project.duration = 1;
  const descriptor = {
    format: 'recording-events-v1' as const,
    formatVersion: 1 as const,
    algorithm: 'lossless-v1' as const,
    encoding: 'json-utf8-v1' as const,
    eventStreamId: 'a'.repeat(32),
    state: 'complete' as const,
    finalized: true,
    totalBlocks: 1,
    totalRecords: 3,
    totalBytes: 1000,
    streamSha256: 'b'.repeat(64),
  };
  project.actionFeedback = [
    {
      recordingId: 'source',
      sourceInstanceId: 'instance',
      events: descriptor,
      settings: [],
      signals: [],
    },
  ];
  const prepared = attachRecordingEventGroups(project, { start: 0, end: 1 }, [
    {
      recordingId: 'source',
      sourceInstanceId: 'instance',
      eventStreamId: 'a'.repeat(32),
      descriptor,
      writerGeneration: 'generation',
      signals: [],
      cadence: new Map(),
      actions: [
        {
          id: 'captured',
          kind: 'KEY',
          label: 'Ctrl+S',
          data: {},
          point: null,
          capturedDuration: 0,
          anchor: {
            kind: 'recording-source',
            recordingId: 'source',
            sourceInstanceId: 'instance',
            sourceEventId: 'key',
            sourceTime: 0,
          },
        },
      ],
    },
  ]);
  const prepare = vi.fn(async () => prepared);
  vi.spyOn(eventsOwner, 'createRecordingEventsRenderer').mockReturnValue({ prepare, clear });
  const materializer = createVideoPreviewFrameMaterializer({
    ownerDocument: document,
    project,
    assetUrls: {},
    rasterSize: { height: 360, width: 640 },
  });
  await materializer.renderFrame(0.1, new AbortController().signal);
  expect(prepare).toHaveBeenCalledWith(project, { start: 0.1, end: 0.1 }, expect.any(AbortSignal));
  const sceneProject = renderPreviewScene.mock.calls.at(-1)?.[0].project;
  expect(
    sceneProject && recordingEventProjectActions(sceneProject).map((event) => event.id)
  ).toEqual(['captured']);
  expect(JSON.stringify(sceneProject)).toBe(JSON.stringify(project));
  materializer.dispose();
  expect(clear).toHaveBeenCalledOnce();
});

it('fails an exact frame when recording history cannot be prepared', async () => {
  const eventsOwner = await import('../../../workflows/video-review/recording-events');
  const error = new Error('Recording history is unavailable');
  vi.spyOn(eventsOwner, 'createRecordingEventsRenderer').mockReturnValue({
    prepare: vi.fn(async () => {
      throw error;
    }),
    clear: vi.fn(),
  });
  const project = createEmptyVideoProject('Unavailable history');
  project.duration = 1;
  const materializer = createVideoPreviewFrameMaterializer({
    ownerDocument: document,
    project,
    assetUrls: {},
    rasterSize: { height: 360, width: 640 },
  });
  await expect(materializer.renderFrame(0.1, new AbortController().signal)).rejects.toBe(error);
  expect(renderPreviewScene).not.toHaveBeenCalled();
  materializer.dispose();
});

it('returns the prepared camera beside pixels while the canvas-only API uses the same operation', async () => {
  const { resolveVideoCompositionFrame } =
    await import('../../../features/video/composition/timeline/frame');
  const project = { ...createEmptyVideoProject('Materialized pose', 8, 4), duration: 2 };
  const camera = { ...resolveVideoCompositionFrame(project, 1).camera, scale: 2.4, viewportX: 123 };
  const owner = createVideoPreviewFrameMaterializer({
    project,
    assetUrls: {},
    ownerDocument: document,
    rasterSize: { width: 8, height: 4 },
  });
  try {
    const result = await owner.renderFrameWithPresentation(1, new AbortController().signal, camera);
    expect(result.canvas).toBe(owner.canvas);
    expect(result.presentation).toEqual({ camera, time: 1 });
    expect(result.presentation.camera).toBe(camera);
    await expect(owner.renderFrame(1, new AbortController().signal, camera)).resolves.toBe(
      owner.canvas
    );
  } finally {
    owner.dispose();
  }
});

function uiOutputFixture() {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 270;
  const release = vi.fn();
  const acquire = vi.fn<NativePreviewGpuTargetFactory>(() => ({
    canvas,
    release,
    surface: { canvas, present: vi.fn(async () => {}), dispose: vi.fn() },
  }));
  const backend: GpuPreviewRenderer = {
    allocatedBytes: 0,
    render: vi.fn<GpuPreviewRenderer['render']>(),
    dispose: vi.fn(),
  };
  return { canvas, release, acquire, backend };
}

it('opts in only one final materialized UI frame and returns its exact camera/output receipt', async () => {
  const owner = resourceFixture();
  const ui = uiOutputFixture();
  const { resolveVideoCompositionFrame } =
    await import('../../../features/video/composition/timeline/frame');
  const project = createEmptyVideoProject('Prepared direct camera', 320, 180);
  const camera = { ...resolveVideoCompositionFrame(project, 0).camera, scale: 2, viewportX: 12 };
  const presentation: PreviewScenePresentation = {
    camera,
    time: 0.25,
    renderer: { backend: 'gpu' },
    output: { canvas: ui.canvas, release: ui.release },
  };
  renderPreviewScene.mockImplementationOnce(async (input) => {
    expect(input.acquireGpuOutput).toBe(ui.acquire);
    expect(input.deferFrameEvent).toBe(true);
    expect(input.cameraOverride).toBe(camera);
    expect(input.acquireGpuOutput?.({ width: 480, height: 270 }, ui.backend).canvas).toBe(
      ui.canvas
    );
    return presentation;
  });
  try {
    const value = await owner.renderFrameWithPresentation(
      0.25,
      new AbortController().signal,
      camera,
      ui.acquire
    );
    expect(value.canvas).toBe(ui.canvas);
    expect(value.presentation).toBe(presentation);
    expect(owner.canvas).not.toBe(ui.canvas);
    expect(owner.canvas.getContext('2d')).not.toBeNull();
    expect(ui.release).not.toHaveBeenCalled();
    renderPreviewScene.mockImplementationOnce(async () => {});
    expect(await owner.renderFrame(0.5, new AbortController().signal, camera)).toBe(owner.canvas);
    expect(renderPreviewScene.mock.lastCall![0].acquireGpuOutput).toBeUndefined();
    expect(renderPreviewScene.mock.lastCall![0].deferFrameEvent).toBeUndefined();
    value.presentation.output?.release();
    expect(ui.release).toHaveBeenCalledOnce();
  } finally {
    owner.dispose();
  }
});

it.each(['abort', 'dispose'] as const)(
  'releases a completed direct receipt when post-render %s prevents handoff',
  async (reason) => {
    const owner = resourceFixture();
    const ui = uiOutputFixture();
    const entered = Promise.withResolvers<void>(),
      fence = Promise.withResolvers<void>();
    const controller = new AbortController();
    renderPreviewScene.mockImplementationOnce(async (input) => {
      entered.resolve();
      await fence.promise;
      return {
        camera: resolveVideoCompositionFrame(input.project, input.currentTime).camera,
        time: input.currentTime,
        output: { canvas: ui.canvas, release: ui.release },
      };
    });
    const pending = owner.renderFrameWithPresentation(
      0.25,
      controller.signal,
      undefined,
      ui.acquire
    );
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await entered.promise;
    if (reason === 'abort') controller.abort();
    else owner.dispose();
    expect(ui.release).not.toHaveBeenCalled();
    fence.resolve();
    await rejected;
    expect(ui.release).toHaveBeenCalledOnce();
    owner.dispose();
  }
);

it.each(['dissolve', 'fade-black'] as const)(
  'keeps %s join sampling outside the UI output capability',
  async (kind) => {
    const f = compositionFixture(kind);
    const ui = uiOutputFixture();
    try {
      await f.owner.renderFrameWithPresentation(
        0.1,
        new AbortController().signal,
        undefined,
        ui.acquire
      );
      expect(renderPreviewScene.mock.lastCall![0].acquireGpuOutput).toBe(ui.acquire);
      renderPreviewScene.mockClear();
      const mixed = await f.owner.renderFrameWithPresentation(
        1,
        new AbortController().signal,
        undefined,
        ui.acquire
      );
      expect(mixed.canvas).toBe(f.owner.canvas);
      expect(mixed.presentation.output).toBeUndefined();
      expect(renderPreviewScene.mock.calls.length).toBeGreaterThan(kind === 'dissolve' ? 1 : 0);
      expect(
        renderPreviewScene.mock.calls.every(
          ([input]) => input.acquireGpuOutput === undefined && input.deferFrameEvent === undefined
        )
      ).toBe(true);
      expect(ui.acquire).not.toHaveBeenCalled();
    } finally {
      f.owner.dispose();
    }
  }
);

it('forwards final UI output for windowed decoding while retaining the existing sample lifetime', async () => {
  mockDelayedSeekVideo();
  const project = createEmptyVideoProject('Direct windowed preview');
  const clip = createVideoClip(project.tracks[0]!.id);
  clip.duration = 1.2;
  clip.playbackWindow = { offset: 0, holdAt: 1 };
  project.clips = [clip];
  const decoded = new Map([[clip.id, { sourceWidth: 16, sourceHeight: 16, draw: vi.fn() }]]);
  cut.sample.mockResolvedValueOnce({ media: decoded, release: cut.release });
  const owner = createVideoPreviewFrameMaterializer({
    project,
    assetUrls: { 'asset-1': 'blob:held' },
    ownerDocument: document,
    rasterSize: { width: 16, height: 9 },
  });
  const ui = uiOutputFixture();
  renderPreviewScene.mockImplementationOnce(async (input) => {
    expect(input.decodedVideoFrames).toBe(decoded);
    expect(input.acquireGpuOutput).toBe(ui.acquire);
    expect(cut.release).not.toHaveBeenCalled();
    return {
      camera: resolveVideoCompositionFrame(input.project, input.currentTime).camera,
      time: input.currentTime,
      output: { canvas: ui.canvas, release: ui.release },
    };
  });
  try {
    const value = await owner.renderFrameWithPresentation(
      1.1,
      new AbortController().signal,
      undefined,
      ui.acquire
    );
    expect(value.canvas).toBe(ui.canvas);
    expect(cut.release).toHaveBeenCalledOnce();
    expect(ui.release).not.toHaveBeenCalled();
    value.presentation.output?.release();
  } finally {
    owner.dispose();
  }
});

it('returns the separate 2D fallback unchanged when an opted-in final frame has no GPU output', async () => {
  const owner = resourceFixture();
  const ui = uiOutputFixture();
  renderPreviewScene.mockImplementationOnce(async (input) => ({
    camera: resolveVideoCompositionFrame(input.project, input.currentTime).camera,
    time: input.currentTime,
    renderer: { backend: 'legacy', fallback: 'unavailable' },
  }));
  try {
    const value = await owner.renderFrameWithPresentation(
      0.25,
      new AbortController().signal,
      undefined,
      ui.acquire
    );
    expect(value.canvas).toBe(owner.canvas);
    expect(value.canvas.getContext('2d')).not.toBeNull();
    expect(value.presentation.output).toBeUndefined();
    expect(value.presentation.renderer).toEqual({ backend: 'legacy', fallback: 'unavailable' });
    expect(ui.acquire).not.toHaveBeenCalled();
  } finally {
    owner.dispose();
  }
});

it('prepares project-sized camera geometry before bounded events and cursor frames', async () => {
  const cursorOwner = await import('../../../workflows/video-review/cursor-trajectory');
  const eventsOwner = await import('../../../workflows/video-review/recording-events');
  const {
    attachPreparedProjectCamera,
    projectCameraInputSignature,
    projectCameraOutputKey,
    preparedProjectCamera,
  } = await import('../../../features/video/composition/motion/prepared-project-camera');
  const demand = await import('../../../features/video/composition/motion/camera-interval');
  vi.spyOn(demand, 'hasCursorFollowingCameraAt').mockReturnValue(true);
  const project = createEmptyVideoProject('Stable camera', 800, 600);
  project.duration = 1;
  const bundle = {
    signature: projectCameraInputSignature(project),
    output: projectCameraOutputKey(project),
    cameras: [],
    orientations: [],
    conflicts: [],
  };
  const prepared = attachPreparedProjectCamera(project, bundle);
  const order: string[] = [];
  const camera = vi.fn(async (source: VideoProject) => {
    order.push('camera');
    return source === project ? prepared : source;
  });
  const frame = vi.fn(async (source: VideoProject) => {
    order.push('frame');
    return source;
  });
  const clear = vi.fn();
  vi.spyOn(cursorOwner, 'createRecordingCursorTrajectoryRenderer').mockReturnValue({
    prepareCamera: camera,
    prepare: frame,
    clear,
  });
  const events = vi.fn(async (source: VideoProject) => {
    order.push('events');
    return { ...source };
  });
  vi.spyOn(eventsOwner, 'createRecordingEventsRenderer').mockReturnValue({
    prepare: events,
    clear: vi.fn(),
  });
  const materializer = createVideoPreviewFrameMaterializer({
    ownerDocument: document,
    project,
    assetUrls: {},
    rasterSize: { width: 480, height: 360 },
  });
  const signal = new AbortController().signal;
  await materializer.renderFrame(0.1, signal);
  await materializer.renderFrame(0.2, signal);
  expect(order).toEqual(['camera', 'events', 'frame', 'camera', 'events', 'frame']);
  expect(camera).toHaveBeenCalledWith(project, undefined, signal);
  expect(events.mock.calls[0]?.[0]).toBe(prepared);
  expect(preparedProjectCamera(renderPreviewScene.mock.calls.at(-1)![0].project)).toBe(bundle);
  materializer.dispose();
  expect(clear).toHaveBeenCalledOnce();
});

it.each(['abort', 'dispose'] as const)(
  'rejects %s during camera preparation before bounded history or scene work',
  async (operation) => {
    const cursorOwner = await import('../../../workflows/video-review/cursor-trajectory');
    const eventsOwner = await import('../../../workflows/video-review/recording-events');
    const demand = await import('../../../features/video/composition/motion/camera-interval');
    vi.spyOn(demand, 'hasCursorFollowingCameraAt').mockReturnValue(true);
    const project = createEmptyVideoProject('Pending camera');
    project.duration = 1;
    const gate = Promise.withResolvers<typeof project>();
    const clear = vi.fn();
    vi.spyOn(cursorOwner, 'createRecordingCursorTrajectoryRenderer').mockReturnValue({
      prepareCamera: vi.fn(() => gate.promise),
      prepare: vi.fn(async (source: VideoProject) => source),
      clear,
    });
    const events = vi.fn(async (source: VideoProject) => source);
    vi.spyOn(eventsOwner, 'createRecordingEventsRenderer').mockReturnValue({
      prepare: events,
      clear: vi.fn(),
    });
    const materializer = createVideoPreviewFrameMaterializer({
      ownerDocument: document,
      project,
      assetUrls: {},
      rasterSize: { width: 480, height: 360 },
    });
    const controller = new AbortController();
    const frame = materializer.renderFrame(0.1, controller.signal);
    if (operation === 'abort') controller.abort();
    else materializer.dispose();
    gate.resolve(project);
    await expect(frame).rejects.toMatchObject({ name: 'AbortError' });
    expect(events).not.toHaveBeenCalled();
    expect(renderPreviewScene).not.toHaveBeenCalled();
    if (operation === 'abort') materializer.dispose();
    expect(clear).toHaveBeenCalledOnce();
  }
);

it('does not wait for irrelevant camera preparation on an ordinary materialized frame', async () => {
  const cursorOwner = await import('../../../workflows/video-review/cursor-trajectory');
  const camera = vi.fn(() => new Promise<VideoProject>(() => {}));
  vi.spyOn(cursorOwner, 'createRecordingCursorTrajectoryRenderer').mockReturnValue({
    prepareCamera: camera,
    prepare: vi.fn(async (source: VideoProject) => source),
    clear: vi.fn(),
  });
  const project = createEmptyVideoProject('Ordinary frame');
  project.duration = 1;
  const materializer = createVideoPreviewFrameMaterializer({
    ownerDocument: document,
    project,
    assetUrls: {},
    rasterSize: { width: 480, height: 360 },
  });
  await materializer.renderFrame(0.1, new AbortController().signal);
  expect(camera).not.toHaveBeenCalled();
  expect(renderPreviewScene).toHaveBeenCalledOnce();
  materializer.dispose();
});

it('forwards the admitted original project to its own GPU provider across derived render projects', async () => {
  const gpu = { acceptsNativeFrames: true, render: vi.fn(async () => false), dispose: vi.fn() };
  const createGpu = vi.spyOn(nativeGpu, 'createNativeGpuPreviewRenderer').mockReturnValue(gpu);
  const project = createEmptyVideoProject('Advisory materializer', 320, 180);
  project.duration = 3;
  const context = { project, signal: new AbortController().signal };
  const latestProject = { ...project, fps: 24 };
  const preparation = { context, project: latestProject, time: 1 };
  const owner = createVideoPreviewFrameMaterializer({
    project,
    ownerDocument: document,
    assetUrls: {},
    rasterSize: { width: 320, height: 180 },
  });
  try {
    await owner.renderFrameWithPresentation(
      1,
      new AbortController().signal,
      undefined,
      undefined,
      preparation
    );
    expect(createGpu).toHaveBeenCalledWith(undefined, {
      createPreparationExecutor: createVideoEditorEffectPreparationExecutor,
    });
    expect(renderPreviewScene).toHaveBeenLastCalledWith(
      expect.objectContaining({ gpuPreview: gpu, effectPreparation: preparation })
    );
    expect(renderPreviewScene.mock.lastCall![0].effectPreparation!.project).toBe(latestProject);
    expect(renderPreviewScene.mock.lastCall![0].effectPreparation!.context.project).toBe(project);
    await owner.renderFrameWithPresentation(1.1, new AbortController().signal);
    expect(renderPreviewScene.mock.lastCall![0]).not.toHaveProperty('effectPreparation');
  } finally {
    owner.dispose();
    createGpu.mockRestore();
  }
});
