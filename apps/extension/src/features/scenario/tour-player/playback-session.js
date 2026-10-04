import { createTourClock } from './clock.js';
import { waitForTourImage } from './media.js';

/** One media-gated clock owns entrance, hold and departure; navigation stays in the playback binding. */
export function createTourPlaybackSession({ signal, motion, hidden, autoplay, changed, complete }) {
  let mode = autoplay ? 'playback' : 'manual';
  let wanted = autoplay && !hidden();
  let running = false;
  let spec = null;
  let autoEntrance = false;
  let departure = null;
  let resolving = false;
  const clock = createTourClock({
    now: () => performance.now(),
    requestFrame: (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame: (id) => globalThis.cancelAnimationFrame(id),
    onChange(elapsed, active) {
      const wasRunning = running;
      running = active;
      if (resolving) return;
      if ((active || wasRunning) && wanted && !departure && spec && elapsed >= spec.exitStart) {
        resolving = true;
        clock.pause();
        if (wasRunning) clock.seek(spec.exitStart);
        resolving = false;
        complete();
        return;
      }
      if (autoEntrance && !departure && !wanted && spec && elapsed >= spec.entrance) {
        autoEntrance = false;
        clock.pause();
        clock.seek(spec.entrance);
        return;
      }
      if (departure || (spec && elapsed > spec.exitStart)) motion.exit(elapsed - spec.exitStart);
      else {
        motion.cancelExit();
        motion.frame(elapsed);
      }
      changed(elapsed, wanted || running, media.state, mode, wanted);
    },
    onComplete() {
      const accepted = departure;
      departure = null;
      accepted?.complete();
    },
  });
  const media = createTourMediaGate(signal, motion, clock, hidden, pause, () => {
    if (departure) startDeparture();
    else if (wanted || (autoEntrance && spec.entrance > clock.elapsed)) clock.play();
  });
  function load(next) {
    cancelDeparture();
    spec = { ...next, exitStart: next.exitStart ?? next.duration };
    autoEntrance = true;
    media.load(spec);
  }
  function cancelDeparture() {
    const cancelled = departure;
    departure = null;
    if (!cancelled) return;
    resolving = true;
    clock.pause();
    clock.seek(Math.min(clock.elapsed, spec.exitStart));
    resolving = false;
    motion.cancelExit();
    cancelled.cancel();
  }
  function startDeparture() {
    clock.seek(Math.max(spec.exitStart, clock.elapsed));
    if (clock.elapsed >= spec.duration) {
      const accepted = departure;
      departure = null;
      accepted.complete();
    } else clock.play();
  }
  function depart(callbacks) {
    cancelDeparture();
    autoEntrance = false;
    departure = callbacks;
    if (!spec || media.state !== 'ready' || spec.duration === spec.exitStart) {
      departure = null;
      callbacks.complete();
    } else if (media.state === 'ready') startDeparture();
  }
  function pause() {
    wanted = false;
    autoEntrance = false;
    cancelDeparture();
    if (spec && clock.elapsed > spec.exitStart) clock.seek(spec.exitStart);
    clock.pause();
  }
  bindSessionRelease(signal, cancelDeparture, media, clock, motion);
  return {
    load,
    pause,
    depart,
    get mode() {
      return mode;
    },
    setManual() {
      mode = 'manual';
      pause();
    },
    get elapsed() {
      return clock.elapsed;
    },
    get playing() {
      return wanted || running;
    },
    get continuous() {
      return wanted;
    },
    get state() {
      return media.state;
    },
    play() {
      mode = 'playback';
      wanted = true;
      if (media.state === 'error' && spec) load(spec);
      else {
        if (clock.elapsed >= (spec?.duration ?? 0) && spec?.duration === spec?.exitStart)
          clock.seek(0);
        if (media.state === 'ready') clock.play();
        else changed(clock.elapsed, true, media.state, mode, wanted);
      }
    },
    seek(elapsed) {
      pause();
      clock.seek(elapsed);
    },
    clear() {
      cancelDeparture();
      media.clear();
      wanted = false;
      autoEntrance = false;
      clock.reset(0);
      motion.cancel();
    },
  };
}

/** Readiness owns only its cancellable decode generation; the supplied session clock remains sole time authority. */
function createTourMediaGate(signal, motion, clock, hidden, pause, resume) {
  let state = 'empty';
  let generation = 0;
  let loading = null;
  function cancel() {
    generation += 1;
    loading?.abort();
  }
  return {
    get state() {
      return state;
    },
    cancel,
    clear() {
      cancel();
      state = 'empty';
    },
    load(spec) {
      cancel();
      const token = generation;
      state = 'loading';
      clock.reset(spec.duration);
      loading = new AbortController();
      const ready =
        spec.required && !spec.source
          ? Promise.reject(new Error('Missing image.'))
          : waitForTourImage(spec.source, loading.signal);
      ready
        .then(() => {
          if (signal.aborted || token !== generation) return;
          state = 'ready';
          motion.ready();
          clock.seek(clock.elapsed);
          if (hidden()) pause();
          else resume();
        })
        .catch(() => {
          if (signal.aborted || token !== generation) return;
          state = 'error';
          motion.fail();
          pause();
        });
    },
  };
}

/** Release the pending route before disposing the media gate, clock and visual projection. */
function bindSessionRelease(signal, cancelDeparture, media, clock, motion) {
  signal.addEventListener(
    'abort',
    () => {
      cancelDeparture();
      media.cancel();
      clock.dispose();
      motion.cancel();
    },
    { once: true }
  );
}
