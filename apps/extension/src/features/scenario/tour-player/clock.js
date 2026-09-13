/** Elapsed monotonic time only; the player owns route selection and media readiness. */
export function createTourClock({ now, requestFrame, cancelFrame, onChange, onComplete }) {
  let duration = 0;
  let elapsed = 0;
  let started = 0;
  let running = false;
  let disposed = false;
  let frame = null;
  let generation = 0;
  const value = () => Math.min(duration, elapsed + (running ? Math.max(0, now() - started) : 0));
  function cancel() {
    generation += 1;
    if (frame !== null) cancelFrame(frame);
    frame = null;
  }
  function schedule() {
    const token = generation;
    frame = requestFrame(() => {
      if (disposed || !running || token !== generation) return;
      frame = null;
      const current = value();
      if (current >= duration) {
        elapsed = duration;
        running = false;
        onChange(elapsed, false);
        if (!disposed && token === generation) onComplete();
      } else {
        onChange(current, true);
        if (!disposed && running && token === generation) schedule();
      }
    });
  }
  return {
    reset(nextDuration) {
      if (disposed) return;
      cancel();
      duration = Math.max(0, nextDuration);
      elapsed = 0;
      running = false;
      onChange(0, false);
    },
    play() {
      if (disposed || running) return;
      cancel();
      running = true;
      started = now();
      const token = generation;
      onChange(elapsed, true);
      if (running && !disposed && token === generation) schedule();
    },
    pause() {
      if (disposed) return;
      elapsed = value();
      running = false;
      cancel();
      onChange(elapsed, false);
    },
    seek(nextElapsed) {
      if (disposed) return;
      const resume = running;
      cancel();
      elapsed = Math.min(duration, Math.max(0, nextElapsed));
      started = now();
      const token = generation;
      onChange(elapsed, running);
      if (resume && running && !disposed && token === generation) schedule();
    },
    get elapsed() {
      return value();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      cancel();
    },
  };
}
