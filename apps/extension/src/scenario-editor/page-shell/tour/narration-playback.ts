import type { TourNarration } from '@sniptale/runtime-contracts/scenario/types/tour';

type PreviewState = { time: number; playing: boolean; ready: boolean; failed: boolean };
/** Selected narration preview only; authored timing and the tour player remain separate. */
export function createNarrationPlayback(
  audio: HTMLAudioElement,
  initial: TourNarration,
  changed: (state: PreviewState) => void,
  signal: AbortSignal
) {
  let narration = initial;
  let context: AudioContext | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let gain: GainNode | null = null;
  let frame = 0;
  let generation = 0;
  let starting = false;
  let failed = false;
  const ready = () => audio.readyState >= 1 && !audio.error && !signal.aborted;
  const sync = () =>
    changed({
      time: audio.currentTime,
      playing: starting || !audio.paused,
      ready: ready(),
      failed,
    });
  const stopFrame = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const pause = () => {
    generation++;
    starting = false;
    audio.pause();
    stopFrame();
    sync();
  };
  const boundary = () => {
    if (audio.currentTime >= narration.trimEnd) {
      pause();
      audio.currentTime = narration.trimEnd;
    }
    sync();
  };
  const monitor = () => {
    boundary();
    if (!audio.paused && !signal.aborted) frame = requestAnimationFrame(monitor);
  };
  const playing = () => {
    stopFrame();
    monitor();
  };
  const paused = () => {
    stopFrame();
    sync();
  };
  const error = () => {
    failed = true;
    pause();
  };
  const hidden = () => {
    if (audio.ownerDocument.hidden) pause();
  };
  const toggle = async () => {
    if (!ready()) return;
    if (starting || !audio.paused) {
      pause();
      return;
    }
    const token = ++generation;
    starting = true;
    failed = false;
    sync();
    try {
      if (!context) {
        context = new AudioContext();
        source = context.createMediaElementSource(audio);
        gain = context.createGain();
        source.connect(gain);
        gain.connect(context.destination);
      }
      gain!.gain.value = narration.gain;
      await context.resume();
      if (signal.aborted || token !== generation) return;
      if (audio.currentTime < narration.trimStart || audio.currentTime >= narration.trimEnd)
        audio.currentTime = narration.trimStart;
      await audio.play();
      if (signal.aborted || token !== generation) {
        audio.pause();
        return;
      }
    } catch {
      if (!signal.aborted && token === generation) {
        failed = true;
        audio.pause();
      }
    } finally {
      if (!signal.aborted && token === generation) {
        starting = false;
        sync();
      }
    }
  };
  audio.addEventListener('loadedmetadata', sync, { signal });
  audio.addEventListener('timeupdate', boundary, { signal });
  audio.addEventListener('playing', playing, { signal });
  audio.addEventListener('pause', paused, { signal });
  audio.addEventListener('ended', paused, { signal });
  audio.addEventListener('error', error, { signal });
  audio.ownerDocument.addEventListener('visibilitychange', hidden, { signal });
  signal.addEventListener(
    'abort',
    () => {
      generation++;
      starting = false;
      audio.pause();
      stopFrame();
      source?.disconnect();
      gain?.disconnect();
      void context?.close().catch(() => {});
      audio.removeAttribute('src');
      audio.load();
    },
    { once: true }
  );
  return {
    toggle,
    seek(time: number) {
      if (!ready() || !Number.isFinite(time)) return;
      audio.currentTime = Math.max(narration.trimStart, Math.min(narration.trimEnd, time));
      boundary();
    },
    update(next: TourNarration) {
      narration = next;
      if (gain) gain.gain.value = next.gain;
      if (audio.currentTime < next.trimStart || audio.currentTime > next.trimEnd) {
        pause();
        audio.currentTime = next.trimStart;
      }
      sync();
    },
  };
}
