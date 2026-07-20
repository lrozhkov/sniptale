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

import { usePreviewStageCanvasRender } from './render';
import { createPreviewEffectRuntimeFeedbackTestStub } from './test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function RenderHarness() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  usePreviewStageCanvasRender({
    activeClips: [],
    canvasRef,
    currentTime: 0,
    effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
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
