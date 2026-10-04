import { sampleVideoTime } from './video-frame-store';

type ActiveFrameRequest = {
  sample: number;
  duration: number;
  backgroundVersion: number | null;
};

type RequestState = {
  duration: number;
  mediaFailed: boolean;
  foreground: number | null;
  lastSample: number | null;
  background: number[];
  backgroundVersion: number;
  active: ActiveFrameRequest | null;
  failed: Set<number>;
};

function prewarmSamples(duration: number, hover?: number): number[] {
  if (duration <= 0) return [];
  if (duration <= 30) {
    return Array.from({ length: Math.ceil(duration) + 1 }, (_, index) => index);
  }
  if (hover === undefined) return [];
  return [-2, -1, 0, 1, 2]
    .map((offset) => hover + offset)
    .filter((sample) => sample >= 0 && sample <= Math.ceil(duration));
}

/** Metadata changes replace obsolete prewarm work and invalidate active background results. */
function updateDuration(state: RequestState, value: number) {
  const duration = Number.isFinite(value) && value > 0 ? value : 0;
  if (duration === state.duration) return;
  state.duration = duration;
  state.backgroundVersion++;
  state.background = prewarmSamples(duration);
  if (state.foreground !== null && duration > 0) {
    state.foreground = Math.min(state.foreground, Math.ceil(duration));
  }
}

/** A new hover supersedes pending work; repeated failed intent waits for a changed target. */
function acceptForegroundIntent(
  state: RequestState,
  sample: number,
  hasFrame: (sample: number) => boolean
): boolean {
  if (sample !== state.lastSample) {
    state.failed.delete(sample);
    state.lastSample = sample;
  }
  if (state.mediaFailed || state.failed.has(sample)) return false;
  if (hasFrame(sample)) {
    state.foreground = null;
    return false;
  }
  state.foreground = sample;
  if (state.duration > 30) {
    state.backgroundVersion++;
    state.background = prewarmSamples(state.duration, sample);
  }
  return true;
}

/** Consume only eligible work, with the latest foreground target first. */
function takeNextSample(state: RequestState, hasFrame: (sample: number) => boolean) {
  if (state.foreground !== null && !hasFrame(state.foreground)) return state.foreground;
  state.foreground = null;
  while (state.background.length) {
    const sample = state.background.shift()!;
    if (!hasFrame(sample) && !state.failed.has(sample)) return sample;
  }
  return null;
}

function beginNext(state: RequestState, hasFrame: (sample: number) => boolean) {
  if (state.mediaFailed || state.duration <= 0 || state.active !== null) return null;
  const sample = takeNextSample(state, hasFrame);
  if (sample === null) return null;
  state.active = {
    sample,
    duration: state.duration,
    backgroundVersion: state.foreground === null ? state.backgroundVersion : null,
  };
  return { sample, seekTime: Math.min(sample, Math.max(0, state.duration - 0.001)) };
}

/** Commit a decoded frame only while its duration and intent still match. */
function completeFrameRequest(
  state: RequestState,
  success: boolean,
  commit: (sample: number) => void
): boolean {
  const active = state.active;
  if (active === null) return false;
  state.active = null;
  const sameDuration = active.duration === state.duration;
  const relevant =
    sameDuration &&
    (state.foreground === active.sample || active.backgroundVersion === state.backgroundVersion);
  if (success && relevant) {
    try {
      commit(active.sample);
    } catch {
      success = false;
    }
  }
  if (!success && sameDuration) state.failed.add(active.sample);
  if (state.foreground === active.sample && sameDuration) state.foreground = null;
  return state.foreground !== null;
}

/** Owns intent priority, prewarm work, and stale result decisions for one source. */
export function createVideoFrameRequests() {
  const state: RequestState = {
    duration: 0,
    mediaFailed: false,
    foreground: null,
    lastSample: null,
    background: [],
    backgroundVersion: 0,
    active: null,
    failed: new Set<number>(),
  };
  return {
    setDuration(value: number) {
      updateDuration(state, value);
    },
    request(time: number, knownDuration: number, hasFrame: (sample: number) => boolean) {
      updateDuration(state, knownDuration);
      const sample = sampleVideoTime(time, state.duration);
      const schedule = acceptForegroundIntent(state, sample, hasFrame);
      const supersede = schedule && state.active !== null && state.active.sample !== sample;
      if (supersede) state.active = null;
      return { sample, schedule, supersede };
    },
    next(hasFrame: (sample: number) => boolean) {
      return beginNext(state, hasFrame);
    },
    complete(success: boolean, commit: (sample: number) => void) {
      return completeFrameRequest(state, success, commit);
    },
    failMedia() {
      state.mediaFailed = true;
      if (state.active === null && state.foreground !== null) {
        state.failed.add(state.foreground);
        state.foreground = null;
      }
    },
    status(sample: number): 'idle' | 'loading' | 'error' {
      if (state.mediaFailed || state.failed.has(sample)) return 'error';
      if (state.foreground === sample || state.active?.sample === sample) return 'loading';
      return 'idle';
    },
    dispose() {
      state.failed.clear();
      state.background = [];
      state.foreground = null;
      state.active = null;
    },
  };
}
