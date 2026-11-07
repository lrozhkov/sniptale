// @vitest-environment jsdom
import { useCursorTrajectoryProject } from '../runtime/cursor-trajectory';
import { prepareCursorTrajectoryProject } from '../../../../features/video/project/cursor-trajectory/project-window';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import type { VideoProject } from '../../../../features/video/project/types';
import { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import type { NativePreviewFramePresenter, PreviewStageCanvasSceneParams } from './types';

const schedulerMocks = vi.hoisted(() => ({
  disposeMock: vi.fn(),
  enqueueExecutorKinds: [] as string[],
  enqueueMock: vi.fn((job: { effectRuntimeExecutor?: unknown }) => {
    schedulerMocks.enqueueExecutorKinds.push(typeof job.effectRuntimeExecutor);
    return () => undefined;
  }),
}));

vi.mock('./render-scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./render-scheduler')>()),
  createPreviewSceneRenderScheduler: vi.fn(() => ({
    dispose: schedulerMocks.disposeMock,
    enqueue: schedulerMocks.enqueueMock,
  })),
}));

vi.mock('./render-preview', () => ({ renderPreviewScene: vi.fn().mockResolvedValue(undefined) }));
import { renderPreviewScene } from './render-preview';
import * as nativeGpu from './gpu-preview';
import { createPreviewSceneRenderScheduler } from './render-scheduler';
import { createReviewSpatialRenderer } from '../../../../features/video/composition/canvas/spatial-renderer';
vi.mock('../../../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: vi.fn(() => ({
    validateSizes: vi.fn(),
    surface: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  })),
}));
import { usePreviewStageCanvasRender } from './render';
import { createPreviewEffectRuntimeFeedbackTestStub } from './test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function RenderHarness({
  retryVersion = 0,
  framePresenterRef,
}: {
  retryVersion?: number;
  framePresenterRef?: React.RefObject<NativePreviewFramePresenter | null>;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  usePreviewStageCanvasRender({
    activeClips: [],
    canvasRef,
    ...(framePresenterRef ? { framePresenterRef } : {}),
    currentTime: 0,
    effectRuntimeFeedback: { ...createPreviewEffectRuntimeFeedbackTestStub(), retryVersion },
    imageBank: {},
    isPlaying: true,
    project: createEmptyVideoProject('Scene', 200, 100),
    resizeVersion: 0,
    stageRef,
    videoFrameState: { canRender: true, version: 0 },
    videoRefs: { current: {} },
  });

  return (
    <div ref={stageRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  schedulerMocks.enqueueExecutorKinds.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('keeps the EffectV1 executor available across StrictMode replayed render enqueue', async () => {
  await act(async () => {
    root?.render(
      <React.StrictMode>
        <RenderHarness />
      </React.StrictMode>
    );
  });

  expect(schedulerMocks.enqueueExecutorKinds.length).toBeGreaterThan(1);
  expect(schedulerMocks.enqueueExecutorKinds).toEqual(
    Array.from({ length: schedulerMocks.enqueueExecutorKinds.length }, () => 'function')
  );
});

it('reuses the runtime staging canvas and releases it when the preview closes', async () => {
  await act(async () => {
    root?.render(<RenderHarness />);
  });
  const options = vi.mocked(createPreviewSceneRenderScheduler).mock.calls.at(-1)![0];
  const canvas = document.createElement('canvas');
  const job = {
    canvas,
    currentTime: 0,
    imageBank: {},
    project: createEmptyVideoProject('Staging owner'),
    stage: null,
    videoRefs: { current: {} },
  };
  await options.render(job);
  const firstFactory = vi.mocked(renderPreviewScene).mock.calls.at(-1)![0].stagingCanvas!;
  const staging = firstFactory();
  expect(staging.ownerDocument).toBe(canvas.ownerDocument);
  expect(staging).not.toBe(canvas);
  staging.width = 640;
  staging.height = 360;
  await options.render({ ...job, currentTime: 1 });
  const nextFactory = vi.mocked(renderPreviewScene).mock.calls.at(-1)![0].stagingCanvas!;
  expect(nextFactory()).toBe(staging);
  await act(async () => {
    root?.unmount();
  });
  root = null;
  expect(staging.width).toBe(0);
  expect(staging.height).toBe(0);
  expect(schedulerMocks.disposeMock).toHaveBeenCalledOnce();
});

it('lazily owns preview GPU resources across retry and rejects stale context-loss callbacks', async () => {
  await act(async () => {
    root?.render(<RenderHarness />);
  });
  const options = vi.mocked(createPreviewSceneRenderScheduler).mock.calls.at(-1)![0];
  const controller = new AbortController();
  const job = {
    canvas: document.createElement('canvas'),
    currentTime: 0,
    imageBank: {},
    project: createEmptyVideoProject('GPU owner'),
    stage: null,
    videoRefs: { current: {} },
    signal: controller.signal,
  };
  await options.render(job);
  expect(createReviewSpatialRenderer).not.toHaveBeenCalled();
  const factory = vi.mocked(renderPreviewScene).mock.calls.at(-1)![0].spatialRenderer!;
  const first = factory();
  expect(factory()).toBe(first);
  const lost = vi.mocked(createReviewSpatialRenderer).mock.calls[0]![0]!;
  await act(async () => {
    root?.render(<RenderHarness retryVersion={1} />);
  });
  expect(
    vi.mocked(createReviewSpatialRenderer).mock.results[0]!.value.dispose
  ).toHaveBeenCalledOnce();
  const next = factory();
  expect(next).not.toBe(first);
  lost();
  expect(
    vi.mocked(createReviewSpatialRenderer).mock.results[0]!.value.dispose
  ).toHaveBeenCalledOnce();
  expect(
    vi.mocked(createReviewSpatialRenderer).mock.results[1]!.value.dispose
  ).not.toHaveBeenCalled();
  expect(factory()).toBe(next);
  await act(async () => {
    root?.unmount();
  });
  root = null;
  expect(
    vi.mocked(createReviewSpatialRenderer).mock.results[1]!.value.dispose
  ).toHaveBeenCalledOnce();
  controller.abort();
  expect(factory).toThrow();
  expect(createReviewSpatialRenderer).toHaveBeenCalledTimes(2);
});

it('keeps watermark preparation in the preview session and clears it on failure, retry and unmount', async () => {
  await act(async () => {
    root?.render(<RenderHarness />);
  });
  const options = vi.mocked(createPreviewSceneRenderScheduler).mock.calls.at(-1)![0];
  const job = {
    canvas: document.createElement('canvas'),
    currentTime: 0,
    imageBank: {},
    project: createEmptyVideoProject('Watermark owner'),
    stage: null,
    videoRefs: { current: {} },
  };
  await options.render(job);
  const owner = vi.mocked(renderPreviewScene).mock.lastCall![0].watermarkRenderer!;
  const clear = vi.spyOn(owner, 'clear');
  await options.render({ ...job, currentTime: 1 });
  expect(vi.mocked(renderPreviewScene).mock.lastCall![0].watermarkRenderer).toBe(owner);
  options.onError(new Error('Preview failed'));
  expect(clear).toHaveBeenCalledTimes(1);
  await act(async () => {
    root?.render(<RenderHarness retryVersion={1} />);
  });
  expect(clear).toHaveBeenCalledTimes(2);
  await act(async () => {
    root?.unmount();
  });
  root = null;
  expect(clear).toHaveBeenCalledTimes(3);
});

it('publishes the accepted job time with its camera receipt', async () => {
  await act(async () => root?.render(<RenderHarness />));
  const options = vi.mocked(createPreviewSceneRenderScheduler).mock.calls.at(-1)![0];
  const controller = new AbortController();
  const onCameraPresented = vi.fn();
  const camera = {
    ...resolveVideoCompositionFrame(createEmptyVideoProject(), 1.25).camera,
    scale: 2.4,
    viewportX: 123,
  };
  const frames = await import('../../../../features/video/composition/timeline/frame');
  const recompute = vi.spyOn(frames, 'resolveVideoCompositionFrame');
  options.onSuccess?.(
    {
      canvas: document.createElement('canvas'),
      controller,
      signal: controller.signal,
      currentTime: 1.25,
      imageBank: {},
      isEffectRuntimeFrame: false,
      isPlaybackFrame: false,
      project: { ...createEmptyVideoProject('Accepted camera'), duration: 4 },
      renderGeneration: 3,
      stage: null,
      videoRefs: { current: {} },
      onCameraPresented,
    },
    { camera, time: 1.25 }
  );
  expect(onCameraPresented).toHaveBeenCalledExactlyOnceWith(camera, 1.25);
  expect(recompute).not.toHaveBeenCalled();
  recompute.mockRestore();
});

it('captures the mounted presenter in the render job and defers its frame event', async () => {
  const presenter: NativePreviewFramePresenter = {
    acquire: vi.fn<NativePreviewFramePresenter['acquire']>(),
    publish: vi.fn(),
  };
  const framePresenterRef = React.createRef<NativePreviewFramePresenter>();
  framePresenterRef.current = presenter;
  await act(async () => root?.render(<RenderHarness framePresenterRef={framePresenterRef} />));
  expect(schedulerMocks.enqueueMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      framePresenter: presenter,
      acquireGpuOutput: presenter.acquire,
      deferFrameEvent: true,
    })
  );
});

it.each([true, false])(
  'commits the surface and camera through one presenter, GPU=%s',
  async (gpu) => {
    await act(async () => root?.render(<RenderHarness />));
    const options = vi.mocked(createPreviewSceneRenderScheduler).mock.calls.at(-1)![0];
    const controller = new AbortController();
    const onCameraPresented = vi.fn();
    const camera = resolveVideoCompositionFrame(createEmptyVideoProject(), 1.25).camera;
    const output = { canvas: document.createElement('canvas'), release: vi.fn() };
    output.canvas.width = 1920;
    output.canvas.height = 1080;
    const fallback = document.createElement('canvas');
    fallback.width = 17;
    fallback.height = 19;
    const framePresenter: NativePreviewFramePresenter = {
      acquire: vi.fn<NativePreviewFramePresenter['acquire']>(),
      publish: vi.fn((_output, accept) => {
        expect(onCameraPresented).not.toHaveBeenCalled();
        expect(fallback.width).toBe(17);
        expect(fallback.height).toBe(19);
        accept();
      }),
    };
    const accepted = options.onSuccess?.(
      {
        canvas: fallback,
        controller,
        signal: controller.signal,
        currentTime: 1.25,
        imageBank: {},
        isEffectRuntimeFrame: false,
        isPlaybackFrame: false,
        project: createEmptyVideoProject('Accepted surface'),
        renderGeneration: 3,
        stage: null,
        videoRefs: { current: {} },
        onCameraPresented,
        framePresenter,
      },
      { camera, time: 1.25, ...(gpu ? { output } : {}) }
    );
    expect(framePresenter.publish).toHaveBeenCalledExactlyOnceWith(
      gpu ? output : null,
      expect.any(Function)
    );
    expect(onCameraPresented).toHaveBeenCalledExactlyOnceWith(camera, 1.25);
    expect(accepted).toBe(gpu);
    expect([fallback.width, fallback.height]).toEqual(gpu ? [1920, 1080] : [17, 19]);
    expect(output.release).not.toHaveBeenCalled();
  }
);

type PlaybackRequest = (time: number) => void;
const bridgeProject = createEmptyVideoProject('Direct playback', 200, 100);
const bridgeFeedback = createPreviewEffectRuntimeFeedbackTestStub();
const bridgeImages = {};
const bridgeVideos: PreviewStageCanvasSceneParams['videoRefs'] = { current: {} };
const bridgeReady = { canRender: true, version: 0 };
let playbackRequest: PlaybackRequest | undefined;
const registerPlaybackRequest = vi.fn((request: PlaybackRequest) => {
  playbackRequest = request;
  return () => {
    if (playbackRequest === request) playbackRequest = undefined;
  };
});
function BridgeHarness({
  time = 0,
  playing = true,
  project = bridgeProject,
  resize = 0,
  ready = bridgeReady,
  registered = true,
  generation = 0,
  clips = [],
  canRenderCursorFrame,
}: {
  time?: number;
  playing?: boolean;
  project?: typeof bridgeProject;
  resize?: number;
  ready?: typeof bridgeReady;
  registered?: boolean;
  generation?: number;
  clips?: PreviewStageCanvasSceneParams['activeClips'];
  canRenderCursorFrame?: (time: number) => boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const generationRef = React.useRef(generation);
  generationRef.current = generation;
  usePreviewStageCanvasRender({
    activeClips: clips,
    ...{ canRenderCursorFrame },
    canvasRef,
    stageRef,
    currentTime: time,
    isPlaying: playing,
    project,
    effectRuntimeFeedback: bridgeFeedback,
    imageBank: bridgeImages,
    videoRefs: bridgeVideos,
    videoFrameState: ready,
    resizeVersion: resize,
    ...{
      registerPlaybackRequest: registered ? registerPlaybackRequest : undefined,
      renderGenerationRef: generationRef,
    },
  });
  return (
    <div ref={stageRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
it('requests playback directly without a React commit and ignores clock-only commits', async () => {
  await act(async () => {
    root?.render(<BridgeHarness />);
  });
  schedulerMocks.enqueueMock.mockClear();
  expect(playbackRequest).toBeTypeOf('function');
  playbackRequest?.(1.25);
  expect(schedulerMocks.enqueueMock).toHaveBeenCalledOnce();
  expect(schedulerMocks.enqueueMock.mock.calls[0]?.[0]).toMatchObject({
    currentTime: 1.25,
    project: bridgeProject,
  });
  await act(async () => {
    root?.render(<BridgeHarness time={1.25} />);
  });
  expect(schedulerMocks.enqueueMock).toHaveBeenCalledOnce();
  expect(registerPlaybackRequest).toHaveBeenCalledOnce();
});
it('refreshes committed edits, resize and readiness at the last direct time and unregisters on pause', async () => {
  await act(async () => {
    root?.render(<BridgeHarness />);
  });
  playbackRequest?.(2);
  const undoProject = { ...bridgeProject, name: 'Undo revision' };
  schedulerMocks.enqueueMock.mockClear();
  await act(async () => {
    root?.render(<BridgeHarness project={undoProject} generation={3} />);
  });
  expect(schedulerMocks.enqueueMock.mock.calls.at(-1)?.[0]).toMatchObject({
    project: undoProject,
    renderGeneration: 3,
  });
  playbackRequest?.(3);
  schedulerMocks.enqueueMock.mockClear();
  await act(async () => {
    root?.render(<BridgeHarness project={undoProject} generation={3} resize={1} />);
  });
  expect(schedulerMocks.enqueueMock.mock.calls.at(-1)?.[0]).toMatchObject({ currentTime: 3 });
  const stale = playbackRequest;
  await act(async () => {
    root?.render(<BridgeHarness project={undoProject} time={4} playing={false} />);
  });
  expect(playbackRequest).toBeUndefined();
  schedulerMocks.enqueueMock.mockClear();
  stale?.(9);
  expect(schedulerMocks.enqueueMock).not.toHaveBeenCalled();
  await act(async () => {
    root?.render(<BridgeHarness project={undoProject} time={5} playing={false} />);
  });
  expect(schedulerMocks.enqueueMock.mock.calls.at(-1)?.[0]).toMatchObject({ currentTime: 5 });
});
it('keeps unregistered previews on the React time path and rejects late unmounted requests', async () => {
  await act(async () => {
    root?.render(<BridgeHarness registered={false} />);
  });
  schedulerMocks.enqueueMock.mockClear();
  await act(async () => {
    root?.render(<BridgeHarness registered={false} time={1} />);
  });
  expect(schedulerMocks.enqueueMock.mock.calls.at(-1)?.[0]).toMatchObject({ currentTime: 1 });
  await act(async () => {
    root?.render(<BridgeHarness />);
  });
  const stale = playbackRequest;
  await act(async () => {
    root?.unmount();
  });
  root = null;
  schedulerMocks.enqueueMock.mockClear();
  stale?.(8);
  expect(schedulerMocks.enqueueMock).not.toHaveBeenCalled();
});

it('holds a dependency transition until the committed media is ready, then refreshes the requested time', async () => {
  const first = createVideoClip({ id: 'first', duration: 1 });
  const second = createVideoClip({ id: 'second', startTime: 1, duration: 2 });
  const project = createProject([first, second]);
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 2 });
  bridgeVideos.current['first'] = video;
  await act(async () => {
    root?.render(<BridgeHarness project={project} clips={[first]} />);
  });
  schedulerMocks.enqueueMock.mockClear();
  playbackRequest?.(1.5);
  expect(schedulerMocks.enqueueMock).not.toHaveBeenCalled();
  await act(async () => {
    root?.render(<BridgeHarness project={project} clips={[second]} time={1.5} />);
  });
  expect(schedulerMocks.enqueueMock).not.toHaveBeenCalled();
  bridgeVideos.current['second'] = video;
  await act(async () => {
    root?.render(
      <BridgeHarness
        project={project}
        clips={[second]}
        time={1.5}
        ready={{ canRender: true, version: 1 }}
      />
    );
  });
  expect(schedulerMocks.enqueueMock).toHaveBeenCalledOnce();
  expect(schedulerMocks.enqueueMock.mock.calls.at(-1)?.[0]).toMatchObject({
    currentTime: 1.5,
    project,
  });
  delete bridgeVideos.current['first'];
  delete bridgeVideos.current['second'];
});
it('retains the React time path for cache playback', async () => {
  let request: PlaybackRequest | undefined;
  function CacheHarness({ time }: { time: number }) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const stageRef = React.useRef<HTMLDivElement | null>(null);
    usePreviewStageCanvasRender({
      activeClips: [],
      canvasRef,
      stageRef,
      currentTime: time,
      isPlaying: true,
      project: bridgeProject,
      previewMode: 'cache',
      imageBank: bridgeImages,
      effectRuntimeFeedback: bridgeFeedback,
      videoRefs: bridgeVideos,
      videoFrameState: bridgeReady,
      resizeVersion: 0,
      registerPlaybackRequest: (next) => {
        request = next;
        return () => {
          request = undefined;
        };
      },
    });
    return <canvas ref={canvasRef} />;
  }
  await act(async () => {
    root?.render(<CacheHarness time={0} />);
  });
  expect(request).toBeUndefined();
  schedulerMocks.enqueueMock.mockClear();
  await act(async () => {
    root?.render(<CacheHarness time={1} />);
  });
  expect(schedulerMocks.enqueueMock.mock.calls.at(-1)?.[0]).toMatchObject({
    currentTime: 1,
    previewMode: 'cache',
  });
});

it('holds the actual direct frame time at an archive boundary and retries it after preparation', async () => {
  const beforeBoundary = (time: number) => time < 1;
  await act(async () => root?.render(<BridgeHarness canRenderCursorFrame={beforeBoundary} />));
  schedulerMocks.enqueueMock.mockClear();
  playbackRequest?.(1.25);
  expect(schedulerMocks.enqueueMock).not.toHaveBeenCalled();
  await act(async () => root?.render(<BridgeHarness canRenderCursorFrame={() => true} />));
  expect(schedulerMocks.enqueueMock).toHaveBeenCalledOnce();
  expect(schedulerMocks.enqueueMock.mock.calls.at(-1)?.[0]).toMatchObject({ currentTime: 1.25 });
});

it('holds an archive-backed direct frame through the hook refresh and retries the latest request', async () => {
  const clip = createVideoClip({ id: 'archive', sourceInstanceId: 'archive', duration: 4 });
  const project = createProject([clip]);
  project.cursorTrack = {
    captureMode: 'separate',
    samples: [],
    skin: normalizeVideoProjectCursorSkin(undefined),
    sourceObservations: [
      {
        recordingId: 'recording',
        sourceInstanceId: 'archive',
        samples: [],
        trajectory: {
          format: 'cursor-trajectory-v1',
          formatVersion: 1,
          algorithm: 'sed-window-v1',
          encoding: 'json-ascii-int-v1',
          trajectoryId: 'a'.repeat(32),
          state: 'complete',
          finalized: true,
          totalBlocks: 1,
          totalRecords: 0,
          totalSamples: 0,
          totalBytes: 0,
          streamSha256: 'b'.repeat(64),
        },
      },
    ],
  };
  const first = Promise.withResolvers<VideoProject>();
  const second = Promise.withResolvers<VideoProject>();
  const prepare = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const createRenderer = () => ({
    prepare,
    prepareCamera: vi.fn(async (source: VideoProject) => source),
    clear: vi.fn(),
  });
  function ArchiveHarness({ time }: { time: number }) {
    const result = useCursorTrajectoryProject(project, time, createRenderer);
    return (
      <BridgeHarness
        time={time}
        project={result.project}
        clips={[clip]}
        canRenderCursorFrame={result.canRender}
      />
    );
  }
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 2 });
  bridgeVideos.current[clip.id] = video;
  try {
    await act(async () => root?.render(<ArchiveHarness time={0.5} />));
    expect(schedulerMocks.enqueueMock).not.toHaveBeenCalled();
    await act(async () =>
      first.resolve(
        await prepareCursorTrajectoryProject(project, 0.5, async () => ({
          fromTimeUs: 0,
          toTimeUs: 1000000,
          records: [],
          initialSegment: null,
        }))
      )
    );
    expect(schedulerMocks.enqueueMock).toHaveBeenCalledOnce();
    schedulerMocks.enqueueMock.mockClear();
    playbackRequest?.(1.25);
    expect(schedulerMocks.enqueueMock).not.toHaveBeenCalled();
    await act(async () => root?.render(<ArchiveHarness time={1.25} />));
    expect(schedulerMocks.enqueueMock).not.toHaveBeenCalled();
    await act(async () =>
      second.resolve(
        await prepareCursorTrajectoryProject(project, 1.25, async () => ({
          fromTimeUs: 1000000,
          toTimeUs: 2000000,
          records: [],
          initialSegment: null,
        }))
      )
    );
    expect(schedulerMocks.enqueueMock).toHaveBeenCalledOnce();
    expect(schedulerMocks.enqueueMock.mock.calls.at(-1)?.[0]).toMatchObject({ currentTime: 1.25 });
  } finally {
    delete bridgeVideos.current[clip.id];
  }
});

it('connects reserved preparation only after the live GPU backend is available', async () => {
  const gpu = { acceptsNativeFrames: true, render: vi.fn(async () => false), dispose: vi.fn() };
  const createGpu = vi.spyOn(nativeGpu, 'createNativeGpuPreviewRenderer').mockReturnValue(gpu);
  vi.stubGlobal('VideoFrame', class {});
  try {
    await act(async () => {
      root?.render(<RenderHarness />);
    });
    const options = vi.mocked(createPreviewSceneRenderScheduler).mock.calls.at(-1)![0];
    const input = {
      canvas: document.createElement('canvas'),
      currentTime: 0,
      imageBank: {},
      project: createEmptyVideoProject('Prepared source'),
      stage: null,
      videoRefs: { current: {} },
    };
    expect(options.prepare?.(input)).toBeUndefined();
    await options.render(input);
    expect(createGpu).toHaveBeenCalledOnce();
    const prepared = await options.prepare?.(input);
    expect(prepared?.input.preparedFrame?.compositionTime).toBe(0);
    expect(prepared?.input.decodedVideoFrames?.size).toBe(0);
    prepared?.release();
    expect(options.prepare?.({ ...input, previewRenderer: 'legacy' })).toBeUndefined();
    expect(options.prepare?.({ ...input, previewMode: 'cache' })).toBeUndefined();
  } finally {
    createGpu.mockRestore();
  }
});
