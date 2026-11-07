import type {
  NativePreviewFramePresenter,
  PreviewScenePresentation,
  PreviewScenePreparedFrame,
} from './types';
import type { renderPreviewScene } from './render-preview';
import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';

export type PreviewSceneRenderJob = Parameters<typeof renderPreviewScene>[0] & {
  controller: AbortController;
  /** The mounted frontend receives the completed output; the producer receives only acquisition. */
  framePresenter?: NativePreviewFramePresenter;
  onCameraPresented?: ((camera: VideoCompositionCameraState, time: number) => void) | undefined;
  isEffectRuntimeFrame: boolean;
  isPlaybackFrame: boolean;
  renderGeneration: number;
  /** The effect-runtime owner advances this value on retry. */
  runtimeVersion?: number;
};

interface PreviewSceneRenderScheduler {
  dispose(): void;
  enqueue(job: PreviewSceneRenderJob): () => void;
}

type Preparation =
  | { job: PreviewSceneRenderJob; kind: 'ready'; frame: PreviewScenePreparedFrame | undefined }
  | { job: PreviewSceneRenderJob; kind: 'failed'; error: unknown };

interface PreviewSceneRenderSchedulerState {
  disposed: boolean;
  preparingJob: PreviewSceneRenderJob | null;
  prepared: Preparation | null;
  activeJob: PreviewSceneRenderJob | null;
  activeSubmitted: boolean;
  lastPlaybackRenderStartedAt: number | null;
  pendingJob: PreviewSceneRenderJob | null;
  scheduledStartTimeout: ReturnType<typeof setTimeout> | null;
  scheduledStartFrame: number | null;
}

interface PreviewSceneRenderSchedulerOptions {
  /** Undefined retains serial admission. A promise owns at most one reserved playback frame. */
  prepare?: (
    input: Parameters<typeof renderPreviewScene>[0]
  ) => Promise<PreviewScenePreparedFrame | undefined> | undefined;
  onError: (error: unknown) => void;
  onSuccess?: (
    job: PreviewSceneRenderJob,
    presentation?: PreviewScenePresentation
  ) => boolean | void;
  render: (job: Parameters<typeof renderPreviewScene>[0]) => ReturnType<typeof renderPreviewScene>;
}

export function createPreviewSceneRenderScheduler(
  args: PreviewSceneRenderSchedulerOptions
): PreviewSceneRenderScheduler {
  const state: PreviewSceneRenderSchedulerState = {
    disposed: false,
    preparingJob: null,
    prepared: null,
    activeJob: null,
    activeSubmitted: false,
    lastPlaybackRenderStartedAt: null,
    pendingJob: null,
    scheduledStartTimeout: null,
    scheduledStartFrame: null,
  };

  return {
    dispose() {
      state.disposed = true;
      clearScheduledStart(state);
      state.activeJob?.controller.abort();
      state.preparingJob?.controller.abort();
      discardPendingFrame(state);
      state.activeJob = null;
      state.activeSubmitted = false;
    },
    enqueue(job) {
      if (state.disposed) {
        job.controller.abort();
        return () => undefined;
      }
      const reserved = state.prepared?.job ?? state.preparingJob;
      if (reserved && state.pendingJob === reserved && canRetainPreparation(reserved, job)) {
        if (reserved !== job) job.controller.abort();
        return () => undefined;
      }
      if (
        state.activeJob &&
        state.activeJob !== job &&
        shouldAbortActivePreviewJob(state.activeJob, job)
      ) {
        state.activeJob.controller.abort();
      }
      if (state.pendingJob && state.pendingJob !== job) discardPendingFrame(state);
      state.pendingJob = job;
      if (!job.isPlaybackFrame) {
        clearScheduledStart(state);
      }
      preparePendingFrame(state, args);
      scheduleNextPreviewSceneRender(state, args);
      return () => {
        if (state.activeJob === job && !job.isPlaybackFrame) {
          job.controller.abort();
        }
        if (state.pendingJob === job) {
          discardPendingFrame(state);
        }
      };
    },
  };
}

function renderInput(job: PreviewSceneRenderJob): Parameters<typeof renderPreviewScene>[0] {
  const {
    controller: _controller,
    framePresenter: _presenter,
    runtimeVersion: _runtime,
    ...input
  } = job;
  return input;
}

function canRetainPreparation(previous: PreviewSceneRenderJob, next: PreviewSceneRenderJob) {
  return (
    previous.isPlaybackFrame &&
    next.isPlaybackFrame &&
    next.currentTime >= previous.currentTime &&
    next.currentTime - previous.currentTime <= 2 / previous.project.fps &&
    previous.renderGeneration === next.renderGeneration &&
    previous.runtimeVersion === next.runtimeVersion &&
    previous.project === next.project &&
    previous.renderRevision === next.renderRevision &&
    previous.previewRenderer === next.previewRenderer &&
    previous.previewMode === next.previewMode &&
    previous.previewRasterSize === next.previewRasterSize &&
    previous.previewCacheBypass === next.previewCacheBypass &&
    previous.canvas === next.canvas &&
    previous.stage === next.stage &&
    previous.framePresenter === next.framePresenter &&
    previous.acquireGpuOutput === next.acquireGpuOutput &&
    previous.onCameraPresented === next.onCameraPresented &&
    previous.videoRefs === next.videoRefs &&
    previous.imageBank === next.imageBank
  );
}

function discardPendingFrame(state: PreviewSceneRenderSchedulerState) {
  state.pendingJob?.controller.abort();
  state.pendingJob = null;
  const prepared = state.prepared;
  state.prepared = null;
  if (prepared?.kind === 'ready') prepared.frame?.release();
}

function preparePendingFrame(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
) {
  const job = state.pendingJob;
  if (
    state.disposed ||
    !state.activeJob ||
    !state.activeSubmitted ||
    !job?.isPlaybackFrame ||
    state.preparingJob ||
    state.prepared ||
    !args.prepare
  )
    return;
  let preparation: ReturnType<NonNullable<typeof args.prepare>>;
  try {
    preparation = args.prepare(renderInput(job));
  } catch (error) {
    state.prepared = { job, kind: 'failed', error };
    return;
  }
  if (!preparation) return;
  state.preparingJob = job;
  void preparation
    .then(
      (frame) => {
        if (state.disposed || state.pendingJob !== job || job.controller.signal.aborted)
          frame?.release();
        else state.prepared = { job, kind: 'ready', frame };
      },
      (error: unknown) => {
        if (!state.disposed && state.pendingJob === job && !job.controller.signal.aborted)
          state.prepared = { job, kind: 'failed', error };
      }
    )
    .finally(() => {
      if (state.preparingJob === job) state.preparingJob = null;
      preparePendingFrame(state, args);
      scheduleNextPreviewSceneRender(state, args);
    });
}

function shouldAbortActivePreviewJob(
  activeJob: PreviewSceneRenderJob,
  nextJob: PreviewSceneRenderJob
): boolean {
  return (
    (activeJob.previewRenderer ?? 'gpu') !== (nextJob.previewRenderer ?? 'gpu') ||
    activeJob.renderGeneration !== nextJob.renderGeneration ||
    !activeJob.isPlaybackFrame ||
    !nextJob.isPlaybackFrame
  );
}

function startNextPreviewSceneRender(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
): void {
  if (
    state.disposed ||
    state.activeJob ||
    !state.pendingJob ||
    state.preparingJob === state.pendingJob
  ) {
    return;
  }
  const job = state.pendingJob;
  state.pendingJob = null;
  const prepared = state.prepared?.job === job ? state.prepared : null;
  state.prepared = null;
  if (prepared?.kind === 'failed') {
    if (!job.controller.signal.aborted) args.onError(prepared.error);
    scheduleNextPreviewSceneRender(state, args);
    return;
  }
  state.activeJob = job;
  state.activeSubmitted = false;
  if (job.isPlaybackFrame) {
    state.lastPlaybackRenderStartedAt = Date.now();
  }
  const { controller } = job;
  const renderJob = prepared?.frame?.input ?? renderInput(job);
  void args
    .render({
      ...renderJob,
      onGpuSubmitted() {
        if (state.activeJob !== job || controller.signal.aborted || state.disposed) return;
        renderJob.onGpuSubmitted?.();
        state.activeSubmitted = true;
        preparePendingFrame(state, args);
      },
    })
    .then(
      (presented) => {
        let transferred = false;
        try {
          if (presented !== false && !controller.signal.aborted) {
            transferred = args.onSuccess?.(job, presented || undefined) === true;
          }
        } catch (error) {
          if (!controller.signal.aborted) args.onError(error);
        } finally {
          if (presented && !transferred) presented.output?.release();
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          args.onError(error);
        }
      }
    )
    .finally(() => {
      try {
        prepared?.frame?.release();
      } finally {
        if (state.activeJob === job) {
          state.activeJob = null;
          state.activeSubmitted = false;
        }
        scheduleNextPreviewSceneRender(state, args);
      }
    });
}

function scheduleNextPreviewSceneRender(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
): void {
  if (
    state.disposed ||
    state.activeJob ||
    !state.pendingJob ||
    state.preparingJob === state.pendingJob ||
    state.scheduledStartTimeout !== null ||
    state.scheduledStartFrame !== null
  ) {
    return;
  }
  const waitMs = resolveNextPreviewRenderDelay(state);
  if (!state.pendingJob.isPlaybackFrame) {
    state.scheduledStartFrame = requestAnimationFrame(() => {
      state.scheduledStartFrame = null;
      state.scheduledStartTimeout = setTimeout(() => {
        state.scheduledStartTimeout = null;
        startNextPreviewSceneRender(state, args);
      }, 0);
    });
    return;
  }
  if (waitMs <= 0) {
    startNextPreviewSceneRender(state, args);
    return;
  }
  state.scheduledStartTimeout = setTimeout(() => {
    state.scheduledStartTimeout = null;
    startNextPreviewSceneRender(state, args);
  }, waitMs);
}

function resolveNextPreviewRenderDelay(state: PreviewSceneRenderSchedulerState): number {
  if (!state.pendingJob?.isPlaybackFrame || state.lastPlaybackRenderStartedAt === null) {
    return 0;
  }
  const minimumInterval = 1000 / state.pendingJob.project.fps;
  return Math.max(0, minimumInterval - (Date.now() - state.lastPlaybackRenderStartedAt));
}

function clearScheduledStart(state: PreviewSceneRenderSchedulerState): void {
  if (state.scheduledStartFrame !== null) {
    cancelAnimationFrame(state.scheduledStartFrame);
    state.scheduledStartFrame = null;
  }
  if (state.scheduledStartTimeout !== null) {
    clearTimeout(state.scheduledStartTimeout);
    state.scheduledStartTimeout = null;
  }
}
