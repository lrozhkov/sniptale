import { getTourNarrationCues, getTourNarrationTarget } from '../project/tour-resources';

/** One narration channel; local commands detach its retained position from the tour clock. */
export function createTourAudio(root, signal, failed, changed = () => {}) {
  const media = createNarrationMedia(root, signal, failed, changed);
  let slide = null;
  let assets = [];
  let cues = [];
  let local = false;
  function stop() {
    local = false;
    media.stop();
  }
  function replay(objectId) {
    if (signal.aborted || !slide) return;
    const target = getTourNarrationTarget(slide, objectId);
    if (!target?.narration) return;
    local = true;
    const cue = { slideId: slide.id, objectId, narration: target.narration };
    if (media.select(cue, assets, cue.narration.trimStart)) media.play();
  }
  return {
    get snapshot() {
      return media.snapshot;
    },
    show(nextSlide, nextAssets) {
      stop();
      slide = nextSlide;
      assets = nextAssets;
      cues = slide ? getTourNarrationCues(slide, { kind: 'enter' }) : [];
    },
    sync(seconds, playing) {
      if (local || signal.aborted) return;
      let offset = 0;
      const cue = cues.find((entry) => {
        const duration = entry.narration.trimEnd - entry.narration.trimStart;
        if (seconds < offset + duration) return true;
        offset += duration;
        return false;
      });
      if (!cue) {
        if (media.snapshot.slideId) stop();
        return;
      }
      if (!media.select(cue, assets, cue.narration.trimStart + Math.max(0, seconds - offset)))
        return;
      if (playing) media.play();
      else media.pause();
    },
    activate(id) {
      if (slide && getTourNarrationCues(slide, { kind: 'activation', objectId: id }).length)
        replay(id);
    },
    replay,
    pause() {
      local = true;
      media.pause();
    },
    resume() {
      local = true;
      if (media.snapshot.canResume) media.play();
    },
    setVolume: media.setVolume,
    setMuted: media.setMuted,
    stop,
  };
}

/** Owns media readiness, actual playback state, trim completion and pending-play invalidation. */
function createNarrationMedia(root, signal, failed, changed) {
  const audio = root.ownerDocument.createElement('audio');
  Object.assign(audio, { hidden: true, preload: 'auto' });
  root.append(audio);
  const mix = createNarrationGain(audio);
  let current = null;
  let status = 'idle';
  let generation = 0;
  let wanted = false;
  let pending = false;
  let frame = 0;
  const snapshot = () => narrationSnapshot(current, status, audio, mix);
  const emit = () => {
    if (!signal.aborted) changed(snapshot());
  };
  function pause(next = 'paused') {
    generation++;
    wanted = false;
    pending = false;
    status = current ? (next === 'paused' && status === 'ended' ? 'ended' : next) : 'idle';
    audio.pause();
    globalThis.cancelAnimationFrame(frame);
    emit();
  }
  function stop() {
    pause('idle');
    current = null;
    audio.removeAttribute('src');
    audio.load();
    emit();
  }
  function fail(error) {
    const blocked = error?.name === 'NotAllowedError';
    pause(blocked ? 'blocked' : 'error');
    failed(blocked ? 'blocked' : 'audio-error');
  }
  function monitor() {
    globalThis.cancelAnimationFrame(frame);
    if (!wanted || !current || signal.aborted) return;
    if (audio.currentTime >= current.narration.trimEnd || audio.ended) {
      pause('ended');
      return;
    }
    frame = globalThis.requestAnimationFrame(monitor);
  }
  async function play() {
    if (signal.aborted || pending || !current || !audio.getAttribute('src')) return;
    if (wanted && !audio.paused) return;
    wanted = true;
    pending = true;
    status = 'loading';
    const token = ++generation;
    emit();
    try {
      const ready = mix.prepare();
      if (ready) await ready;
      if (token !== generation || signal.aborted) return;
      await audio.play();
      if (token !== generation || signal.aborted) {
        if (!wanted || signal.aborted) audio.pause();
        return;
      }
      status = audio.paused ? 'paused' : 'playing';
      monitor();
      emit();
    } catch (error) {
      if (token === generation && !signal.aborted) fail(error);
    } finally {
      if (token === generation) pending = false;
    }
  }
  bindNarrationEvents(audio, signal, {
    playing() {
      if (wanted && current) {
        status = 'playing';
        monitor();
        emit();
      }
    },
    waiting() {
      if (wanted && current) {
        status = 'loading';
        emit();
      }
    },
    pause() {
      if (wanted && current && !pending && audio.paused) pause(audio.ended ? 'ended' : 'paused');
    },
    ended() {
      if (current) pause('ended');
    },
    error() {
      if (current) fail(audio.error);
    },
  });
  signal.addEventListener(
    'abort',
    () => {
      stop();
      audio.remove();
      mix.dispose();
    },
    { once: true }
  );
  return {
    get snapshot() {
      return snapshot();
    },
    select(cue, assets, time) {
      if (signal.aborted) return false;
      const replaced = current !== cue;
      if (replaced) {
        pause();
        current = cue;
        status = 'paused';
      }
      if (!selectNarrationSource(audio, cue, assets, time, replaced)) {
        fail();
        return false;
      }
      mix.setGain(cue.narration.gain);
      return true;
    },
    play,
    pause,
    stop,
    setVolume(value) {
      if (!signal.aborted) {
        mix.setVolume(value);
        emit();
      }
    },
    setMuted(value) {
      if (!signal.aborted) {
        mix.setMuted(value);
        emit();
      }
    },
  };
}

/** Composes authored gain with one transient viewer master without changing authored data. */
function createNarrationGain(audio) {
  let authored = 1,
    volume = 1,
    muted = false;
  let context = null,
    gain = null,
    source = null;
  function apply() {
    audio.volume = Math.min(1, authored) * volume * (muted ? 0 : 1);
    if (gain) gain.gain.value = Math.max(1, authored);
  }
  return {
    get snapshot() {
      return { volume, muted };
    },
    get audible() {
      return audio.volume > 0 && (!context || context.state === 'running');
    },
    setGain(value) {
      authored = value;
      apply();
    },
    setVolume(value) {
      if (typeof value === 'number' && Number.isFinite(value))
        volume = Math.min(1, Math.max(0, value));
      apply();
    },
    setMuted(value) {
      muted = value === true;
      apply();
    },
    prepare() {
      if (authored > 1 && !context) {
        context = new globalThis.AudioContext();
        gain = context.createGain();
        source = context.createMediaElementSource(audio);
        source.connect(gain);
        gain.connect(context.destination);
        apply();
      }
      return context?.resume();
    },
    dispose() {
      source?.disconnect();
      gain?.disconnect();
      void context?.close().catch(() => {});
    },
  };
}

function bindNarrationEvents(audio, signal, handlers) {
  for (const [name, handler] of Object.entries(handlers))
    audio.addEventListener(name, handler, { signal });
}

/** Projects media state without a second UI-owned copy of command or master state. */
function narrationSnapshot(current, status, audio, mix) {
  return {
    slideId: current?.slideId ?? null,
    objectId: current?.objectId ?? null,
    status,
    canResume: Boolean(
      current &&
      audio.getAttribute('src') &&
      audio.currentTime < current.narration.trimEnd &&
      ['paused', 'blocked', 'error'].includes(status)
    ),
    ...mix.snapshot,
    audible: Boolean(current && status === 'playing' && !audio.paused && mix.audible),
  };
}

/** Source replacement resets position exactly; clock synchronization tolerates media drift. */
function selectNarrationSource(audio, cue, assets, time, replaced) {
  if (replaced) {
    const source = assets.find((asset) => asset.id === cue.narration.assetId)?.src;
    if (!source) {
      audio.removeAttribute('src');
      audio.load();
      return false;
    }
    audio.src = source;
  }
  if (
    replaced ||
    Math.abs(audio.currentTime - time) > 0.15 ||
    audio.currentTime < cue.narration.trimStart
  )
    audio.currentTime = time;
  return Boolean(audio.getAttribute('src'));
}

/** One optional music channel consumes the narration owner's master and actual audible projection. */
export function createTourMusic(root, signal, getAudioSnapshot, changed = () => {}) {
  const audio = root.ownerDocument.createElement('audio');
  Object.assign(audio, { hidden: true, preload: 'auto' });
  audio.dataset.tourMusic = '';
  root.append(audio);
  let binding = null;
  let source = null;
  let muted = false;
  const snapshot = () => ({ available: Boolean(binding), muted, ...media.snapshot });
  const emit = () => {
    if (!signal.aborted) changed(snapshot());
  };
  const mix = createMusicGain(
    audio,
    getAudioSnapshot,
    () => binding,
    () => muted
  );
  const media = createMusicMedia(audio, signal, mix.prepare, emit);
  function refreshMix() {
    if (signal.aborted) return;
    mix.refresh();
    emit();
  }
  signal.addEventListener(
    'abort',
    () => {
      media.reset(null, false);
      audio.remove();
      mix.dispose();
    },
    { once: true }
  );
  return {
    get snapshot() {
      return snapshot();
    },
    configure(nextBinding, assets) {
      if (signal.aborted) return;
      const nextSource = nextBinding
        ? (assets.find((asset) => asset.id === nextBinding.assetId)?.src ?? null)
        : null;
      const replaced = binding?.assetId !== nextBinding?.assetId || source !== nextSource;
      binding = nextBinding ?? null;
      source = nextSource;
      audio.loop = Boolean(binding?.loop);
      if (replaced) media.reset(source, Boolean(binding));
      refreshMix();
    },
    play: media.play,
    pause: media.pause,
    finish() {
      if (!signal.aborted) media.reset(source, Boolean(binding));
    },
    refreshMix,
    setMuted(value) {
      if (signal.aborted) return;
      muted = value === true;
      refreshMix();
    },
  };
}

/** Music readiness and exhaustion are independent of scene changes and the progression clock. */
function createMusicMedia(audio, signal, prepare, changed) {
  let status = 'idle';
  let exhausted = false;
  let wanted = false;
  let pending = false;
  let generation = 0;
  function pause(next = 'paused') {
    generation++;
    wanted = false;
    pending = false;
    status = exhausted ? 'ended' : next;
    audio.pause();
    changed();
  }
  async function play() {
    if (signal.aborted || exhausted || pending || !audio.getAttribute('src')) return;
    if (wanted && !audio.paused) return;
    wanted = true;
    pending = true;
    status = 'loading';
    const token = ++generation;
    changed();
    try {
      await prepare();
      if (signal.aborted || token !== generation) return;
      await audio.play();
      if (signal.aborted || token !== generation) {
        if (signal.aborted || !wanted) audio.pause();
        return;
      }
      status = audio.paused ? 'paused' : 'playing';
      changed();
    } catch (error) {
      if (!signal.aborted && token === generation)
        pause(error?.name === 'NotAllowedError' ? 'blocked' : 'error');
    } finally {
      if (token === generation) pending = false;
    }
  }
  bindNarrationEvents(audio, signal, {
    playing() {
      if (wanted) {
        status = 'playing';
        changed();
      }
    },
    waiting() {
      if (wanted) {
        status = 'loading';
        changed();
      }
    },
    pause() {
      if (wanted && !pending && audio.paused) pause();
    },
    ended() {
      if (!audio.loop && audio.ended && audio.getAttribute('src')) {
        exhausted = true;
        pause('ended');
      }
    },
    error() {
      if (audio.getAttribute('src')) pause('error');
    },
  });
  return {
    get snapshot() {
      return { status, exhausted };
    },
    play,
    pause,
    reset(source, available) {
      pause('idle');
      exhausted = false;
      if (source) audio.src = source;
      else audio.removeAttribute('src');
      audio.load();
      audio.currentTime = 0;
      status = source ? 'paused' : available ? 'error' : 'idle';
      changed();
    },
  };
}

/** Only the duck envelope is smoothed; master and either mute apply immediately to the media. */
function createMusicGain(audio, getMaster, getBinding, getMuted) {
  let context = null,
    source = null,
    gain = null;
  let target = 1;
  function refresh() {
    const binding = getBinding();
    const master = getMaster();
    audio.volume = (binding?.volume ?? 0) * master.volume * (master.muted || getMuted() ? 0 : 1);
    const next = binding?.ducking.enabled && master.audible ? binding.ducking.level : 1;
    if (!gain || next === target) return;
    const now = context.currentTime;
    gain.gain.cancelAndHoldAtTime(now);
    gain.gain.linearRampToValueAtTime(next, now + (next < gain.gain.value ? 0.15 : 0.25));
    target = next;
  }
  return {
    refresh,
    prepare() {
      if (!context) {
        context = new globalThis.AudioContext();
        gain = context.createGain();
        source = context.createMediaElementSource(audio);
        source.connect(gain);
        gain.connect(context.destination);
        const binding = getBinding();
        target = binding?.ducking.enabled && getMaster().audible ? binding.ducking.level : 1;
        gain.gain.setValueAtTime(target, context.currentTime);
      }
      refresh();
      return context.resume();
    },
    dispose() {
      source?.disconnect();
      gain?.disconnect();
      void context?.close().catch(() => {});
    },
  };
}
