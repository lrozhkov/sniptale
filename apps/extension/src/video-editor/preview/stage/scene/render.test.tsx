// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';

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

function RenderHarness({ retryVersion = 0 }: { retryVersion?: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  usePreviewStageCanvasRender({
    activeClips: [],
    canvasRef,
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
  expect(first.dispose).toHaveBeenCalledOnce();
  const next = factory();
  expect(next).not.toBe(first);
  lost();
  expect(first.dispose).toHaveBeenCalledOnce();
  expect(next.dispose).not.toHaveBeenCalled();
  expect(factory()).toBe(next);
  await act(async () => {
    root?.unmount();
  });
  root = null;
  expect(next.dispose).toHaveBeenCalledOnce();
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
