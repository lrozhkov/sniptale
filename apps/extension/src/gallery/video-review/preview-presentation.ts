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

type ReviewPresentationTickPhase = 'after-paint' | 'prepared-playing-frame';

interface Dependencies<Scene, Prepared, Captured, Completed> {
  /** Only opted-in owners can admit a published playing generation on its animation frame. */
  allowPreparedPlayingFrames?: boolean;
  maximumInFlight?(scene: Scene): 1 | 2;
  requestTick(callback: () => void, phase?: ReviewPresentationTickPhase): number;
  cancelTick(id: number): void;
  now(): number;
  sampleTime(): number;
  prepare(
    request: ReviewPresentationRequest<Scene>,
    signal: AbortSignal
  ): Promise<ReviewPresentationLease<Prepared>>;
  capture(
    prepared: Prepared,
    time: number,
    signal: AbortSignal
  ): ReviewPresentationLease<Captured> | Promise<ReviewPresentationLease<Captured>>;
  render(
    prepared: Prepared,
    captured: Captured,
    request: ReviewPresentationRequest<Scene>,
    signal: AbortSignal
  ): ReviewPresentationLease<Completed> | Promise<ReviewPresentationLease<Completed>>;
  publish(completed: Completed, request: ReviewPresentationRequest<Scene>): void;
  onError(error: unknown): void;
}

/** New preparation waits until after paint. Prepared playing frames can use the animation frame. */
export function createReviewPresentationPaintClock() {
  let nextId = 0;
  const ticks = new Map<number, { frame: number; task?: ReturnType<typeof setTimeout> }>();
  return {
    requestTick(callback: () => void, phase: ReviewPresentationTickPhase = 'after-paint') {
      const id = ++nextId;
      const tick: { frame: number; task?: ReturnType<typeof setTimeout> } = {
        frame: requestAnimationFrame(() => {
          if (phase === 'prepared-playing-frame') {
            ticks.delete(id);
            callback();
            return;
          }
          tick.task = setTimeout(() => {
            ticks.delete(id);
            callback();
          }, 0);
        }),
      };
      ticks.set(id, tick);
      return id;
    },
    cancelTick(id: number) {
      const tick = ticks.get(id);
      if (!tick) return;
      cancelAnimationFrame(tick.frame);
      if (tick.task !== undefined) clearTimeout(tick.task);
      ticks.delete(id);
    },
  };
}

function advancePresentationClock(frameRate: number | null, since: number, now: number) {
  if (!frameRate || !Number.isFinite(since)) return now;
  const period = 1000 / frameRate;
  // Keep the cadence phase; delivery jitter must not add another period to every frame.
  return since + Math.max(1, Math.floor((now - since + 0.1) / period)) * period;
}

/** Bounded request leases retain ordered publication; native transport remains an injected read. */
export function createReviewPreviewPresentation<Scene, Prepared, Captured, Completed>(
  dependencies: Dependencies<Scene, Prepared, Captured, Completed>
) {
  let state: ReviewPresentationState<Scene> | null = null;
  let pending: ReviewPresentationState<Scene> | null = null;
  const active = new Map<AbortController, number>();
  let publicationTail: Promise<void> | null = null;
  let publication: (() => void) | null = null;
  let tick: number | null = null;
  let epoch = 0;
  let disposed = false;
  let failed = false;
  let lastPublished = -Infinity;
  let lastAdmitted = -Infinity;
  let publishedEpoch = -1;
  const current = (version: number) => !disposed && !failed && state?.visible && epoch === version;
  // Browser frame clocks can round a 30 FPS interval to 33.3 ms.
  const due = (since: number) =>
    !state?.frameRate || dependencies.now() - since >= 1000 / state.frameRate - 0.1;
  const advanceClock = (since: number) =>
    advancePresentationClock(state?.frameRate ?? null, since, dependencies.now());
  const cancelTick = () => {
    if (tick !== null) dependencies.cancelTick(tick);
    tick = null;
  };
  const schedule = () => {
    if (disposed || failed || !state?.visible || tick !== null) return;
    if (!state.playing && !state.interacting && (!pending || active.size > 0)) return;
    tick = dependencies.requestTick(
      () => {
        tick = null;
        if (!state?.visible || failed || disposed) return;
        if (publication && due(lastPublished)) publication();
        if (state.playing) pending = state;
        // A paused request is one-shot: wait until it can publish before consuming it.
        const admissionClock = state.playing || state.interacting ? lastAdmitted : lastPublished;
        const capacity =
          state.playing && !state.interacting && publishedEpoch === epoch
            ? (dependencies.maximumInFlight?.(state.scene) ?? 1)
            : 1;
        const draining = [...active.values()].some((version) => version !== epoch);
        if (!draining && active.size < capacity && pending && due(admissionClock)) {
          const next = pending;
          pending = null;
          void present(next);
        }
        schedule();
      },
      dependencies.allowPreparedPlayingFrames &&
        state.playing &&
        !state.interacting &&
        publishedEpoch === epoch
        ? 'prepared-playing-frame'
        : 'after-paint'
    );
  };
  const present = async (description: ReviewPresentationState<Scene>) => {
    const version = epoch;
    const controller = new AbortController();
    active.set(controller, version);
    const predecessor = publicationTail;
    let finishPublicationOrder!: () => void;
    const ordering = new Promise<void>((resolve) => {
      finishPublicationOrder = resolve;
    });
    publicationTail = ordering;
    lastAdmitted = advanceClock(lastAdmitted);
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
      const capture = dependencies.capture(prepared.value, request.time, controller.signal);
      captured = capture instanceof Promise ? await capture : capture;
      if (!current(version)) return;
      completed = await dependencies.render(
        prepared.value,
        captured.value,
        request,
        controller.signal
      );
      if (predecessor) await predecessor;
      if (!current(version)) return;
      if (!due(lastPublished)) {
        if (!description.playing && !description.interacting) {
          pending = state;
          return;
        }
        // Keep the sole completed lease until its publication slot instead of rerendering it.
        await new Promise<void>((resolve) => {
          const finish = () => {
            if (publication === finish) publication = null;
            controller.signal.removeEventListener('abort', finish);
            resolve();
          };
          publication = finish;
          controller.signal.addEventListener('abort', finish, { once: true });
        });
        if (!current(version)) return;
      }
      dependencies.publish(completed.value, request);
      if (current(version)) {
        lastPublished = advanceClock(lastPublished);
        const firstPublication = publishedEpoch !== version;
        publishedEpoch = version;
        if (
          firstPublication &&
          dependencies.allowPreparedPlayingFrames &&
          state?.playing &&
          !state.interacting
        )
          cancelTick();
      }
    } catch (error) {
      if (current(version)) {
        failed = true;
        for (const request of active.keys()) request.abort();
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
            active.delete(controller);
            finishPublicationOrder();
            if (publicationTail === ordering) publicationTail = null;
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
    for (const request of active.keys()) request.abort();
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
      // The new FPS policy follows the published phase after pending admissions are invalidated.
      if (state?.frameRate !== next.frameRate) lastAdmitted = lastPublished;
      state = { ...next };
      if (changed) invalidate();
    },
    invalidate,
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch++;
      for (const request of active.keys()) request.abort();
      pending = null;
      state = null;
      cancelTick();
    },
  };
}
