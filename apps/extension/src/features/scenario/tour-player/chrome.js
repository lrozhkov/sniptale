const HIDE_DELAY_MS = 2000;

/**
 * One chrome controller owns the overlay visibility: playback updates only
 * re-evaluate state, while real user activity reveals and restarts the countdown.
 */
export function createTourChrome(root, signal) {
  const document = root.ownerDocument;
  let timer = 0;
  let playing = false;
  let state = 'ready';
  const navigationOpen = () => root.querySelector('[data-tour-navigation]')?.open === true;
  const interactive = () => playing && state === 'ready' && !navigationOpen() && !document.hidden;
  const cancel = () => {
    globalThis.clearTimeout(timer);
    timer = 0;
  };
  const schedule = () => {
    timer = globalThis.setTimeout(() => {
      timer = 0;
      root.dataset.tourChromeHidden = 'true';
    }, HIDE_DELAY_MS);
  };
  const evaluate = () => {
    cancel();
    root.dataset.tourPlaying = String(playing);
    if (!interactive()) {
      root.dataset.tourChromeHidden = 'false';
      return;
    }
    schedule();
  };
  const activity = () => {
    root.dataset.tourChromeHidden = 'false';
    cancel();
    if (interactive()) schedule();
  };
  for (const type of ['pointermove', 'pointerdown', 'touchstart', 'focusin'])
    root.addEventListener(type, activity, { signal, passive: true });
  document.addEventListener('keydown', activity, { signal });
  document.addEventListener('visibilitychange', evaluate, { signal });
  signal.addEventListener('abort', cancel, { once: true });
  return {
    update(next) {
      const changed = next.playing !== playing || next.state !== state;
      playing = Boolean(next.playing);
      state = next.state;
      if (changed) evaluate();
    },
  };
}
