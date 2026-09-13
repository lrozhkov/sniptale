import { createTourClock } from './clock.js';
import { waitForTourImage } from './media.js';

/** One media-gated clock owns entrance and hold; navigation stays in the playback binding. */
export function createTourPlaybackSession({ signal, motion, hidden, autoplay, changed, complete }) {
  let wanted = autoplay;
  let running = false;
  let state = 'empty';
  let generation = 0;
  let loading = null;
  let spec = null;
  let autoEntrance = false;
  const clock = createTourClock({
    now: () => performance.now(),
    requestFrame: (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame: (id) => globalThis.cancelAnimationFrame(id),
    onChange(elapsed, active) {
      running = active;
      if (autoEntrance && !wanted && spec && elapsed >= spec.entrance) {
        autoEntrance = false;
        clock.pause();
        clock.seek(spec.entrance);
        return;
      }
      motion.frame(elapsed);
      changed(elapsed, wanted || running, state);
    },
    onComplete() {
      if (wanted) complete();
    },
  });
  function load(next) {
    loading?.abort();
    const token = ++generation;
    spec = next;
    autoEntrance = true;
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
        if (hidden()) {
          pause();
          return;
        }
        if (wanted || (autoEntrance && spec.entrance > clock.elapsed)) clock.play();
      })
      .catch(() => {
        if (signal.aborted || token !== generation) return;
        state = 'error';
        motion.fail();
        pause();
      });
  }
  function pause() {
    wanted = false;
    autoEntrance = false;
    clock.pause();
  }
  signal.addEventListener(
    'abort',
    () => {
      generation += 1;
      loading?.abort();
      clock.dispose();
      motion.cancel();
    },
    { once: true }
  );
  return {
    load,
    pause,
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
      return state;
    },
    play() {
      wanted = true;
      if (state === 'error' && spec) load(spec);
      else {
        if (clock.elapsed >= (spec?.duration ?? 0)) clock.seek(0);
        if (state === 'ready') clock.play();
        else changed(clock.elapsed, true, state);
      }
    },
    seek(elapsed) {
      pause();
      clock.seek(elapsed);
    },
    clear() {
      generation += 1;
      loading?.abort();
      wanted = false;
      autoEntrance = false;
      state = 'empty';
      clock.reset(0);
      motion.cancel();
    },
  };
}
