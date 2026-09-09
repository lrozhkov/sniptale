import type { renderPreviewScene } from './render-preview';

export type PreviewSceneRenderJob = Parameters<typeof renderPreviewScene>[0] & {
  controller: AbortController;
  isEffectRuntimeFrame: boolean;
  isPlaybackFrame: boolean;
  renderGeneration: number;
};

interface PreviewSceneRenderScheduler {
  dispose(): void;
  enqueue(job: PreviewSceneRenderJob): () => void;
}

interface PreviewSceneRenderSchedulerState {
  activeJob: PreviewSceneRenderJob | null;
  lastPlaybackRenderStartedAt: number | null;
  pendingJob: PreviewSceneRenderJob | null;
  scheduledStartTimeout: ReturnType<typeof setTimeout> | null;
}

interface PreviewSceneRenderSchedulerOptions {
  onError: (error: unknown) => void;
  onSuccess?: () => void;
  render: (job: Parameters<typeof renderPreviewScene>[0]) => ReturnType<typeof renderPreviewScene>;
}

export function createPreviewSceneRenderScheduler(
  args: PreviewSceneRenderSchedulerOptions
): PreviewSceneRenderScheduler {
  const state: PreviewSceneRenderSchedulerState = {
    activeJob: null,
    lastPlaybackRenderStartedAt: null,
    pendingJob: null,
    scheduledStartTimeout: null,
  };

  return {
    dispose() {
      clearScheduledStart(state);
      state.activeJob?.controller.abort();
      state.pendingJob?.controller.abort();
      state.activeJob = null;
      state.pendingJob = null;
    },
    enqueue(job) {
      if (
        state.activeJob &&
        state.activeJob !== job &&
        shouldAbortActivePreviewJob(state.activeJob, job)
      ) {
        state.activeJob.controller.abort();
      }
      if (state.pendingJob && state.pendingJob !== job) {
        state.pendingJob.controller.abort();
      }
      state.pendingJob = job;
      if (!job.isPlaybackFrame) {
        clearScheduledStart(state);
      }
      scheduleNextPreviewSceneRender(state, args);
      return () => {
        if (state.activeJob === job && !job.isPlaybackFrame) {
          job.controller.abort();
        }
        if (state.pendingJob === job) {
          state.pendingJob = null;
          job.controller.abort();
        }
      };
    },
  };
}

function shouldAbortActivePreviewJob(
  activeJob: PreviewSceneRenderJob,
  nextJob: PreviewSceneRenderJob
): boolean {
  return (
    activeJob.renderGeneration !== nextJob.renderGeneration ||
    !activeJob.isPlaybackFrame ||
    !nextJob.isPlaybackFrame
  );
}

function startNextPreviewSceneRender(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
): void {
  if (state.activeJob || !state.pendingJob) {
    return;
  }
  const job = state.pendingJob;
  state.pendingJob = null;
  state.activeJob = job;
  if (job.isPlaybackFrame) {
    state.lastPlaybackRenderStartedAt = Date.now();
  }
  const { controller, ...renderJob } = job;
  void args
    .render(renderJob)
    .then(
      (presented) => {
        if (presented !== false && !controller.signal.aborted) {
          args.onSuccess?.();
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          args.onError(error);
        }
      }
    )
    .finally(() => {
      if (state.activeJob === job) {
        state.activeJob = null;
      }
      scheduleNextPreviewSceneRender(state, args);
    });
}

function scheduleNextPreviewSceneRender(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
): void {
  if (state.activeJob || !state.pendingJob || state.scheduledStartTimeout) {
    return;
  }
  const waitMs = resolveNextPreviewRenderDelay(state);
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
  if (state.scheduledStartTimeout) {
    clearTimeout(state.scheduledStartTimeout);
    state.scheduledStartTimeout = null;
  }
}
