// @vitest-environment jsdom
import type { NativePreviewSourceRuntime } from '../media/source-runtime';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as schedulerOwner from './render-scheduler';
import { usePreviewStageCanvasRender } from './render';
import { createPreviewEffectRuntimeFeedbackTestStub } from './test-support';
import { createVideoClip } from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProject } from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import { createPreviewSceneRenderScheduler, type PreviewSceneRenderJob } from './render-scheduler';
import type { PreviewSceneRenderInput } from './types';
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function job(): PreviewSceneRenderJob & { sourceRuntime: NativePreviewSourceRuntime } {
  return {
    project: createProject([]),
    canvas: document.createElement('canvas'),
    stage: null,
    currentTime: 1,
    imageBank: {},
    videoRefs: { current: {} },
    previewRenderer: 'gpu',
    isPlaybackFrame: true,
    isEffectRuntimeFrame: false,
    renderGeneration: 0,
    controller: new AbortController(),
    sourceRuntime: {
      selected: true,
      prepare: vi.fn(async () => 'ready' as const),
      acquire: vi.fn(async () => null),
    },
    acquireGpuOutput: () => {
      throw new Error('Unused output factory');
    },
  };
}
function prepared(input: PreviewSceneRenderInput, isolated: boolean) {
  return {
    ...input,
    preparedFrame: {
      passes: resolveVideoCompositionRenderPasses(input.project, input.currentTime),
      rasterScale: 1,
      compositionTime: input.currentTime,
      sourcePresentation: new Map(),
      gpuIsolated: isolated,
      sourceFrames: {
        nominal: new Map(),
        bindings: new Map(),
        media: () => new Map(),
        release: vi.fn(),
      },
    },
  };
}
it.each([false, true])(
  'separates source readiness from GPU isolation capability %s',
  async (isolated) => {
    const completion = Promise.withResolvers<void>();
    const released = vi.fn();
    const render = vi.fn((input: PreviewSceneRenderInput) => {
      input.onGpuSubmitted?.();
      return completion.promise;
    });
    const prepare = vi.fn(async (input: PreviewSceneRenderInput) => ({
      input: prepared(input, input.currentTime === 1 || isolated),
      release: released,
    }));
    const scheduler = createPreviewSceneRenderScheduler({
      maximumInFlight: 2,
      prepare,
      render,
      onError: vi.fn(),
    });
    const first = job();
    scheduler.enqueue(first);
    expect(prepare).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(render).toHaveBeenCalledOnce();
    const second = {
      ...first,
      currentTime: 1 + 1 / first.project.fps,
      controller: new AbortController(),
    };
    scheduler.enqueue(second);
    await vi.advanceTimersByTimeAsync(50);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(isolated ? 2 : 1);
    expect(released).not.toHaveBeenCalled();
    completion.resolve();
    await vi.advanceTimersByTimeAsync(50);
    expect(render).toHaveBeenCalledTimes(2);
    expect(released).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  }
);
it.each(['sync', 'async'] as const)(
  'drops %s pending source input without HTML render or completion',
  async (mode) => {
    const render = vi.fn(async () => undefined);
    const onSuccess = vi.fn();
    const scheduler = createPreviewSceneRenderScheduler({
      prepare: mode === 'sync' ? () => undefined : async () => undefined,
      render,
      onSuccess,
      onError: vi.fn(),
    });
    scheduler.enqueue(job());
    await vi.advanceTimersByTimeAsync(50);
    expect(render).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    scheduler.dispose();
  }
);

it('forwards the selected source handle through mounted direct requests without HTML readiness', async () => {
  vi.useRealTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const clip = createVideoClip();
  const project = createProject([clip]);
  const runtime = job().sourceRuntime!;
  const enqueue = vi.fn((_job: unknown) => () => undefined);
  vi.spyOn(schedulerOwner, 'createPreviewSceneRenderScheduler').mockReturnValue({
    enqueue,
    dispose: vi.fn(),
  });
  let request: ((time: number) => void) | undefined;
  const register = (next: (time: number) => void) => {
    request = next;
    return () => {
      request = undefined;
    };
  };
  function Harness() {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const stageRef = React.useRef<HTMLDivElement | null>(null);
    usePreviewStageCanvasRender({
      activeClips: [clip],
      project,
      currentTime: 1,
      canvasRef,
      stageRef,
      imageBank: {},
      videoRefs: { current: {} },
      videoFrameState: { canRender: true, version: 0 },
      resizeVersion: 0,
      isPlaying: true,
      sourceRuntime: runtime,
      registerPlaybackRequest: register,
      effectRuntimeFeedback: createPreviewEffectRuntimeFeedbackTestStub(),
    });
    return (
      <div ref={stageRef}>
        <canvas ref={canvasRef} />
      </div>
    );
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Harness />));
    enqueue.mockClear();
    act(() => request?.(1.05));
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({ currentTime: 1.05, sourceRuntime: runtime });
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
