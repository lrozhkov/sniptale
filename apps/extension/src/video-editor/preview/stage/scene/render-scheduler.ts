import { isPreviewFrameGpuIsolated } from './source-frames';
import { arePreviewImageResourcesCurrent } from './image-resources';
import type { GpuPreviewFramePresenter } from '../../../../features/video/composition/canvas/preview-presentation';
import type {
  PreviewScenePresentation,
  PreviewScenePreparedFrame,
  PreviewSceneImageResources,
} from './types';
import { resolvePreviewCompositionFrameSize } from './canvas';
import type { renderPreviewScene } from './render-preview';
import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';

export type PreviewSceneRenderJob = Parameters<typeof renderPreviewScene>[0] & {
  controller: AbortController;
  effectPreparationProject?: Parameters<typeof renderPreviewScene>[0]['project'] | undefined;
  /** The mounted frontend receives the completed output; the producer receives only acquisition. */
  framePresenter?: GpuPreviewFramePresenter;
  onCameraPresented?: ((camera: VideoCompositionCameraState, time: number) => void) | undefined;
  isEffectRuntimeFrame: boolean;
  isPlaybackFrame: boolean;
  renderGeneration: number;
  /** The effect-runtime owner advances this value on retry. */
  runtimeVersion?: number;
  /** Resize invalidates geometry without changing the project identity. */
  layoutVersion?: number;
};

interface PreviewSceneRenderScheduler {
  dispose(): void;
  enqueue(job: PreviewSceneRenderJob): () => void;
}

type Preparation =
  | {
      job: PreviewSceneRenderJob;
      kind: 'ready';
      frame: PreviewScenePreparedFrame | undefined;
      imageResources?: PreviewSceneImageResources | undefined;
    }
  | { job: PreviewSceneRenderJob; kind: 'failed'; error: unknown };

type ActiveRender = {
  job: PreviewSceneRenderJob;
  independent: boolean;
  submitted: boolean;
  finished: boolean;
  presentation?: Awaited<ReturnType<typeof renderPreviewScene>>;
  imageResources?: PreviewSceneImageResources | undefined;
};

interface PreviewSceneRenderSchedulerState {
  disposed: boolean;
  preparingJob: PreviewSceneRenderJob | null;
  preparingImages: { job: PreviewSceneRenderJob; resources: PreviewSceneImageResources } | null;
  prepared: Preparation | null;
  active: ActiveRender[];
  latestJob: PreviewSceneRenderJob | null;
  failure: { error: unknown; retry: boolean } | null;
  effectPreparation: {
    context: NonNullable<PreviewSceneRenderJob['effectPreparation']>['context'];
    controller: AbortController;
    dimensions: string;
    ownerDocument: Document;
  } | null;
  lastPlaybackRenderStartedAt: number | null;
  pendingJob: PreviewSceneRenderJob | null;
  scheduledStartTimeout: ReturnType<typeof setTimeout> | null;
  scheduledStartFrame: number | null;
}

interface PreviewSceneRenderSchedulerOptions {
  maximumInFlight?: 1 | 2;
  /** Recognized GPU failure defers fallback until all admitted jobs drain. */
  retrySerial?: (error: unknown) => boolean;
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
    preparingImages: null,
    prepared: null,
    active: [],
    latestJob: null,
    failure: null,
    effectPreparation: null,
    lastPlaybackRenderStartedAt: null,
    pendingJob: null,
    scheduledStartTimeout: null,
    scheduledStartFrame: null,
  };

  return {
    dispose() {
      state.disposed = true;
      state.effectPreparation?.controller.abort();
      state.effectPreparation = null;
      clearScheduledStart(state);
      for (const active of state.active) active.job.controller.abort();
      state.preparingJob?.controller.abort();
      discardPendingFrame(state);
      flushCompleted(state, args);
    },
    enqueue(job) {
      if (state.disposed) {
        job.controller.abort();
        return () => undefined;
      }
      const eligible =
        !!job.effectPreparationProject &&
        job.isPlaybackFrame &&
        job.previewRenderer === 'gpu' &&
        job.previewMode !== 'cache';
      const output = eligible
        ? (job.previewRasterSize ?? resolvePreviewCompositionFrameSize(job))
        : null;
      const dimensions = JSON.stringify([
        job.project.fps,
        job.project.width,
        job.project.height,
        output?.width,
        output?.height,
        job.renderGeneration,
        job.runtimeVersion,
        job.previewRenderer,
        job.previewMode,
        job.previewCacheBypass,
      ]);
      const preparation = state.effectPreparation;
      if (
        !eligible ||
        !output ||
        !preparation ||
        preparation.context.project !== job.effectPreparationProject ||
        preparation.dimensions !== dimensions ||
        preparation.ownerDocument !== job.canvas.ownerDocument
      ) {
        state.effectPreparation?.controller.abort();
        state.effectPreparation = null;
      }
      if (eligible && output) {
        if (!state.effectPreparation) {
          const controller = new AbortController();
          state.effectPreparation = {
            controller,
            context: { project: job.effectPreparationProject!, signal: controller.signal },
            dimensions,
            ownerDocument: job.canvas.ownerDocument,
          };
        }
        job.effectPreparation = {
          context: state.effectPreparation.context,
          project: job.project,
          time: job.currentTime,
        };
      } else delete job.effectPreparation;
      state.latestJob = job;
      const reserved = state.prepared?.job ?? state.preparingJob;
      if (
        reserved &&
        state.pendingJob === reserved &&
        canRetainPreparation(
          reserved,
          job,
          state.prepared?.kind === 'ready'
            ? state.prepared.imageResources
            : state.preparingImages?.job === reserved
              ? state.preparingImages.resources
              : undefined
        )
      ) {
        if (reserved !== job) job.controller.abort();
        return () => undefined;
      }
      for (const active of state.active) {
        if (
          active.job !== job &&
          shouldAbortActivePreviewJob(active.job, job, active.imageResources)
        )
          active.job.controller.abort();
      }
      if (state.pendingJob && state.pendingJob !== job) discardPendingFrame(state);
      state.pendingJob = job;
      if (!job.isPlaybackFrame) {
        clearScheduledStart(state);
      }
      preparePendingFrame(state, args);
      scheduleNextPreviewSceneRender(state, args);
      return () => {
        if (state.active.some((active) => active.job === job) && !job.isPlaybackFrame) {
          job.controller.abort();
        }
        if (state.pendingJob === job) {
          discardPendingFrame(state);
        }
      };
    },
  };
}

function renderInput(
  job: PreviewSceneRenderJob,
  onImages?: (resources: PreviewSceneImageResources) => void
): Parameters<typeof renderPreviewScene>[0] {
  const {
    controller: _controller,
    framePresenter: _presenter,
    runtimeVersion: _runtime,
    layoutVersion: _layout,
    effectPreparationProject: _provenance,
    ...input
  } = job;
  return {
    ...input,
    signal: job.controller.signal,
    ...(job.previewRenderer === 'gpu' && job.previewMode !== 'cache' && onImages
      ? { onImageResourcesPrepared: onImages }
      : {}),
  };
}

function sameRenderingContext(
  previous: PreviewSceneRenderJob,
  next: PreviewSceneRenderJob,
  images?: PreviewSceneImageResources
) {
  return (
    previous.sourceRuntime === next.sourceRuntime &&
    previous.renderGeneration === next.renderGeneration &&
    previous.runtimeVersion === next.runtimeVersion &&
    previous.layoutVersion === next.layoutVersion &&
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
    (images
      ? arePreviewImageResourcesCurrent(images, next.imageBank)
      : previous.imageBank === next.imageBank) &&
    previous.assetUrls === next.assetUrls
  );
}

function canRetainPreparation(
  previous: PreviewSceneRenderJob,
  next: PreviewSceneRenderJob,
  images?: PreviewSceneImageResources
) {
  return (
    previous.isPlaybackFrame &&
    next.isPlaybackFrame &&
    next.currentTime >= previous.currentTime &&
    next.currentTime - previous.currentTime <= 2 / previous.project.fps &&
    sameRenderingContext(previous, next, images)
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
    state.failure ||
    (!job?.sourceRuntime?.selected && (!state.active.at(-1)?.submitted || !job?.isPlaybackFrame)) ||
    !job ||
    state.preparingJob ||
    state.prepared ||
    !args.prepare
  )
    return;
  let preparation: ReturnType<NonNullable<typeof args.prepare>>;
  try {
    preparation = args.prepare(
      renderInput(job, (resources) => {
        if (!state.disposed && state.pendingJob === job) {
          state.preparingImages = { job, resources };
          if (state.latestJob && !sameRenderingContext(job, state.latestJob, resources))
            job.controller.abort();
        }
      })
    );
  } catch (error) {
    state.prepared = { job, kind: 'failed', error };
    return;
  }
  if (!preparation) {
    if (job.sourceRuntime?.selected) state.prepared = { job, kind: 'ready', frame: undefined };
    return;
  }
  state.preparingJob = job;
  void preparation
    .then(
      (frame) => {
        if (state.disposed || state.pendingJob !== job || job.controller.signal.aborted)
          frame?.release();
        else
          state.prepared = {
            job,
            kind: 'ready',
            frame,
            imageResources:
              frame?.input.preparedFrame?.imageResources ??
              (state.preparingImages?.job === job ? state.preparingImages.resources : undefined),
          };
      },
      (error: unknown) => {
        if (!state.disposed && state.pendingJob === job && !job.controller.signal.aborted)
          state.prepared = { job, kind: 'failed', error };
      }
    )
    .finally(() => {
      if (state.preparingJob === job) state.preparingJob = null;
      if (state.preparingImages?.job === job) state.preparingImages = null;
      flushCompleted(state, args);
      preparePendingFrame(state, args);
      scheduleNextPreviewSceneRender(state, args);
    });
}

function shouldAbortActivePreviewJob(
  active: PreviewSceneRenderJob,
  next: PreviewSceneRenderJob,
  images?: PreviewSceneImageResources
) {
  return (
    !sameRenderingContext(active, next, images) || !active.isPlaybackFrame || !next.isPlaybackFrame
  );
}

function canStart(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
) {
  const job = state.pendingJob;
  if (state.disposed || state.failure || !job || state.preparingJob === job) return false;
  if (!state.active.length) return true;
  const preparation = state.prepared;
  return (
    state.active.length < (args.maximumInFlight ?? 1) &&
    preparation?.kind === 'ready' &&
    Boolean(preparation.frame && isPreviewFrameGpuIsolated(preparation.frame.input)) &&
    Boolean(job.acquireGpuOutput) &&
    job.isPlaybackFrame &&
    state.active.every(
      (active) =>
        active.independent &&
        active.submitted &&
        !active.job.controller.signal.aborted &&
        sameRenderingContext(active.job, job, active.imageResources)
    )
  );
}

function failRender(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions,
  error: unknown
) {
  if (state.failure || state.disposed) return;
  state.failure = { error, retry: args.retrySerial?.(error) === true };
  state.effectPreparation?.controller.abort();
  state.effectPreparation = null;
  clearScheduledStart(state);
  for (const active of state.active) active.job.controller.abort();
  if (state.preparingJob) {
    state.preparingJob.controller.abort();
    if (state.pendingJob === state.preparingJob) discardPendingFrame(state);
  }
}

function flushCompleted(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
) {
  while (state.active[0]?.finished) {
    const active = state.active.shift()!;
    const presented = active.presentation;
    let transferred = false;
    try {
      if (
        !state.disposed &&
        !state.failure &&
        !active.job.controller.signal.aborted &&
        (!state.latestJob ||
          sameRenderingContext(active.job, state.latestJob, active.imageResources)) &&
        presented !== false
      )
        transferred = args.onSuccess?.(active.job, presented || undefined) === true;
    } catch (error) {
      failRender(state, args, error);
    } finally {
      if (presented && !transferred) presented.output?.release();
    }
  }
  if (state.active.length || state.preparingJob || !state.failure) return;
  const failure = state.failure;
  state.failure = null;
  if (state.disposed) return;
  if (failure.retry) {
    const latest = state.latestJob;
    discardPendingFrame(state);
    if (latest) {
      const controller = new AbortController();
      state.pendingJob = { ...latest, controller, signal: controller.signal };
    }
  } else args.onError(failure.error);
}

function startNextPreviewSceneRender(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
): void {
  if (!canStart(state, args)) return;
  const job = state.pendingJob!;
  state.pendingJob = null;
  const prepared = state.prepared?.job === job ? state.prepared : null;
  state.prepared = null;
  if (prepared?.kind === 'failed') {
    if (!job.controller.signal.aborted) failRender(state, args, prepared.error);
    flushCompleted(state, args);
    scheduleNextPreviewSceneRender(state, args);
    return;
  }
  if (job.sourceRuntime?.selected && prepared?.kind === 'ready' && !prepared.frame) {
    job.controller.abort();
    scheduleNextPreviewSceneRender(state, args);
    return;
  }
  const active: ActiveRender = {
    job,
    imageResources: prepared?.kind === 'ready' ? prepared.imageResources : undefined,
    submitted: false,
    finished: false,
    independent: Boolean(
      prepared?.frame &&
      isPreviewFrameGpuIsolated(prepared.frame.input) &&
      job.acquireGpuOutput &&
      job.isPlaybackFrame
    ),
  };
  state.active.push(active);
  if (job.isPlaybackFrame) state.lastPlaybackRenderStartedAt = Date.now();
  const renderJob = prepared?.frame?.input ?? renderInput(job);
  const finish = () => {
    try {
      prepared?.frame?.release();
    } finally {
      active.finished = true;
      flushCompleted(state, args);
      preparePendingFrame(state, args);
      scheduleNextPreviewSceneRender(state, args);
    }
  };
  let render: ReturnType<typeof args.render>;
  try {
    render = args.render({
      ...renderJob,
      ...(job.previewRenderer === 'gpu' && job.previewMode !== 'cache'
        ? {
            onImageResourcesPrepared(resources: PreviewSceneImageResources) {
              if (state.disposed || job.controller.signal.aborted) return;
              active.imageResources = resources;
              if (state.latestJob && !sameRenderingContext(job, state.latestJob, resources))
                job.controller.abort();
            },
          }
        : {}),
      onGpuSubmitted() {
        if (job.controller.signal.aborted || state.disposed) return;
        renderJob.onGpuSubmitted?.();
        active.submitted = true;
        preparePendingFrame(state, args);
        scheduleNextPreviewSceneRender(state, args);
      },
    });
  } catch (error) {
    failRender(state, args, error);
    finish();
    return;
  }
  void render
    .then(
      (presented) => {
        active.presentation = presented;
      },
      (error: unknown) => {
        if (!job.controller.signal.aborted) failRender(state, args, error);
      }
    )
    .finally(finish);
}

function scheduleNextPreviewSceneRender(
  state: PreviewSceneRenderSchedulerState,
  args: PreviewSceneRenderSchedulerOptions
): void {
  if (
    !canStart(state, args) ||
    state.scheduledStartTimeout !== null ||
    state.scheduledStartFrame !== null
  )
    return;
  const waitMs = resolveNextPreviewRenderDelay(state);
  if (!state.pendingJob!.isPlaybackFrame) {
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
