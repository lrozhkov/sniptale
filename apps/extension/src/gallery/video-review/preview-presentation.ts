/** A scheduler-owned value. Publication must copy or independently retain its front frame. */
interface ReviewPresentationLease<T> {
  value: T;
  release(): void;
}

/** Generation binds the immutable scene, source, seek and presentation settings. */
export interface ReviewPresentationState<Scene> {
  scene: Scene;
  generation: string;
  visible: boolean;
  playing: boolean;
  interacting: boolean;
  frameRate: number | null;
  detailedPaused: boolean;
  pausedTime: number;
}

/** Scene time is sampled after preparation, separately from captured media timestamps. */
interface ReviewPresentationRequest<Scene> {
  scene: Scene;
  generation: string;
  quality: 'selected' | 'detailed';
  time: number;
}

interface Dependencies<Scene, Prepared, Captured, Completed> {
  requestTick(callback: () => void): number;
  cancelTick(id: number): void;
  now(): number;
  sampleTime(): number;
  prepare(
    request: ReviewPresentationRequest<Scene>,
    signal: AbortSignal
  ): Promise<ReviewPresentationLease<Prepared>>;
  capture(prepared: Prepared, time: number): ReviewPresentationLease<Captured>;
  render(
    prepared: Prepared,
    captured: Captured,
    request: ReviewPresentationRequest<Scene>,
    signal: AbortSignal
  ): ReviewPresentationLease<Completed> | Promise<ReviewPresentationLease<Completed>>;
  publish(completed: Completed, request: ReviewPresentationRequest<Scene>): void;
  onError(error: unknown): void;
}

/** One preparation and one pending description; native transport remains an injected read. */
export function createReviewPreviewPresentation<Scene, Prepared, Captured, Completed>(
  dependencies: Dependencies<Scene, Prepared, Captured, Completed>
) {
  let state: ReviewPresentationState<Scene> | null = null;
  let pending: ReviewPresentationState<Scene> | null = null;
  let active: AbortController | null = null;
  let tick: number | null = null;
  let epoch = 0;
  let disposed = false;
  let failed = false;
  let lastPublished = -Infinity;
  let lastAdmitted = -Infinity;
  const current = (version: number) => !disposed && !failed && state?.visible && epoch === version;
  const due = (since: number) =>
    !state?.frameRate || dependencies.now() - since >= 1000 / state.frameRate - 1e-7;
  const cancelTick = () => {
    if (tick !== null) dependencies.cancelTick(tick);
    tick = null;
  };
  const schedule = () => {
    if (disposed || failed || !state?.visible || tick !== null) return;
    if (!state.playing && !state.interacting && (!pending || active)) return;
    tick = dependencies.requestTick(() => {
      tick = null;
      if (!state?.visible || failed || disposed) return;
      if (state.playing) pending = state;
      // A paused request is one-shot: wait until it can publish before consuming it.
      const admissionClock = state.playing || state.interacting ? lastAdmitted : lastPublished;
      if (!active && pending && due(admissionClock)) {
        const next = pending;
        pending = null;
        void present(next);
      }
      schedule();
    });
  };
  const present = async (description: ReviewPresentationState<Scene>) => {
    const version = epoch;
    const controller = new AbortController();
    active = controller;
    lastAdmitted = dependencies.now();
    const request: ReviewPresentationRequest<Scene> = {
      scene: description.scene,
      generation: description.generation,
      quality:
        description.detailedPaused && !description.playing && !description.interacting
          ? 'detailed'
          : 'selected',
      time: description.pausedTime,
    };
    let prepared: ReviewPresentationLease<Prepared> | undefined;
    let captured: ReviewPresentationLease<Captured> | undefined;
    let completed: ReviewPresentationLease<Completed> | undefined;
    try {
      prepared = await dependencies.prepare(request, controller.signal);
      if (!current(version)) return;
      request.time = description.playing ? dependencies.sampleTime() : description.pausedTime;
      if (!Number.isFinite(request.time)) throw new Error('Invalid presentation time');
      if (!current(version)) return;
      captured = dependencies.capture(prepared.value, request.time);
      if (!current(version)) return;
      completed = await dependencies.render(
        prepared.value,
        captured.value,
        request,
        controller.signal
      );
      if (!current(version)) return;
      if (!due(lastPublished)) {
        if (!description.playing) pending = state;
        return;
      }
      dependencies.publish(completed.value, request);
      if (current(version)) lastPublished = dependencies.now();
    } catch (error) {
      if (current(version)) {
        failed = true;
        pending = null;
        cancelTick();
        dependencies.onError(error);
      }
    } finally {
      try {
        completed?.release();
      } finally {
        try {
          captured?.release();
        } finally {
          try {
            prepared?.release();
          } finally {
            active = null;
            schedule();
          }
        }
      }
    }
  };
  const invalidate = () => {
    if (disposed) return;
    epoch++;
    failed = false;
    active?.abort();
    cancelTick();
    pending = state?.visible ? state : null;
    schedule();
  };
  return {
    update(next: ReviewPresentationState<Scene>) {
      if (disposed) return;
      if (next.frameRate !== null && (!Number.isFinite(next.frameRate) || next.frameRate <= 0))
        throw new Error('Invalid presentation frame rate');
      const changed =
        !state ||
        state.generation !== next.generation ||
        state.scene !== next.scene ||
        state.visible !== next.visible ||
        state.playing !== next.playing ||
        state.interacting !== next.interacting ||
        state.frameRate !== next.frameRate ||
        state.detailedPaused !== next.detailedPaused ||
        (!next.playing && state.pausedTime !== next.pausedTime);
      state = { ...next };
      if (changed) invalidate();
    },
    invalidate,
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      active?.abort();
      pending = null;
      state = null;
      cancelTick();
    },
  };
}
