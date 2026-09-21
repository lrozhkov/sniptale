import { getTourNarrationCues } from '../project/tour-resources';

/** One current media element; entry cues follow the tour clock, activation cues pause that clock. */
export function createTourAudio(root, signal, failed) {
  const audio = root.ownerDocument.createElement('audio');
  audio.hidden = true;
  audio.preload = 'auto';
  root.append(audio);
  let slide = null,
    assets = [],
    cues = [],
    current = null,
    activation = false;
  let pending = false,
    generation = 0,
    frame = 0;
  let context = null,
    gain = null;
  function pause() {
    generation++;
    pending = false;
    if (current) audio.pause();
    globalThis.cancelAnimationFrame(frame);
  }
  function stop() {
    pause();
    current = null;
    activation = false;
    if (audio.getAttribute('src')) {
      audio.removeAttribute('src');
      audio.load();
    }
  }
  function select(cue, time) {
    if (current !== cue) {
      pause();
      current = cue;
      const source = assets.find((asset) => asset.id === cue.narration.assetId)?.src;
      if (!source) {
        failed('error');
        return false;
      }
      audio.src = source;
    }
    if (Math.abs(audio.currentTime - time) > 0.15 || audio.currentTime < cue.narration.trimStart)
      audio.currentTime = time;
    audio.volume = Math.min(1, cue.narration.gain);
    if (gain) gain.gain.value = cue.narration.gain > 1 ? cue.narration.gain : 1;
    return true;
  }
  async function play() {
    if (pending || !audio.paused || !current) return;
    pending = true;
    const token = ++generation;
    try {
      if (current.narration.gain > 1 && !context) {
        context = new globalThis.AudioContext();
        gain = context.createGain();
        context.createMediaElementSource(audio).connect(gain);
        gain.connect(context.destination);
        gain.gain.value = current.narration.gain;
      }
      if (context) await context.resume();
      if (token !== generation || signal.aborted) return;
      await audio.play();
      if (token !== generation || signal.aborted) return;
      if (activation) monitor();
    } catch (error) {
      if (token === generation && !signal.aborted) {
        pause();
        failed(error?.name === 'NotAllowedError' ? 'blocked' : 'error');
      }
    } finally {
      if (token === generation) pending = false;
    }
  }
  function monitor() {
    if (!activation || !current || signal.aborted) return;
    if (audio.currentTime >= current.narration.trimEnd) {
      pause();
      return;
    }
    frame = globalThis.requestAnimationFrame(monitor);
  }
  audio.addEventListener(
    'error',
    () => {
      if (current) {
        pause();
        failed('error');
      }
    },
    { signal }
  );
  signal.addEventListener(
    'abort',
    () => {
      stop();
      audio.remove();
      void context?.close().catch(() => {});
    },
    { once: true }
  );
  return {
    show(nextSlide, nextAssets) {
      stop();
      slide = nextSlide;
      assets = nextAssets;
      cues = slide ? getTourNarrationCues(slide, { kind: 'enter' }) : [];
    },
    sync(seconds, playing) {
      if (activation) return;
      let offset = 0;
      const cue = cues.find((entry) => {
        const duration = entry.narration.trimEnd - entry.narration.trimStart;
        if (seconds < offset + duration) return true;
        offset += duration;
        return false;
      });
      if (!cue) {
        if (current) stop();
        return;
      }
      if (!select(cue, cue.narration.trimStart + Math.max(0, seconds - offset))) return;
      if (playing) void play();
      else if (!audio.paused || pending) pause();
    },
    activate(id) {
      const cue = slide && getTourNarrationCues(slide, { kind: 'activation', objectId: id })[0];
      if (!cue) return;
      activation = true;
      if (select(cue, cue.narration.trimStart)) void play();
    },
    stop,
  };
}
