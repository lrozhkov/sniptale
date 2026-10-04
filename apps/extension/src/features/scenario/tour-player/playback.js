import { createTourAudio, createTourMusic } from './audio.js';
import { createTourPlaybackSession } from './playback-session.js';
import {
  tourSlideDuration,
  tourAutoplayDestination,
  tourLinearTimeline,
  tourEntranceTiming,
  tourHighlightTiming,
} from './timing.js';
import {
  createTourTransport,
  createTourVolumeControls,
  projectTourAudioControls,
  createTourMusicControls,
  projectTourMusicControls,
} from './transport.js';
import { getTourNarrationTargets } from '../project/tour-resources';

/** Audio preview syncs only until a decoding error takes over the transport state. */
function syncPlaybackAudio(audio, { audioState, elapsed, entrance, playing, state }) {
  if (audioState) return;
  audio.sync(
    Math.max(0, elapsed - entrance) / 1000,
    playing && state === 'ready' && elapsed >= entrance && !audioState
  );
}

/** Projects transport and route policy; the session owns media readiness and the single clock. */
export function createTourPlayback(root, input, { signal, motion, navigate, chrome }) {
  let tour = input.tour;
  let index = 0;
  let ended = false;
  let duration = 0;
  let entrance = 0;
  let exitStart = 0;
  let assets = input.assets;
  let timeline = null;
  let choice = false;
  const visited = new Set();
  const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => Boolean(motionPreference?.matches);
  const update = createTourTransport(root, input.labels, signal, toggle, seek, manual);
  const setVolumeAvailable = createTourVolumeControls(root, input.labels, signal);
  const playbackView = (elapsed, state) => ({
    elapsed: ended ? (timeline?.duration ?? duration) : (timeline?.offsets[index] ?? 0) + elapsed,
    duration: timeline?.duration ?? duration,
    state: audioState ?? (choice ? 'choice' : ended && state !== 'loading' ? 'ended' : state),
  });
  let audioState = null;
  const { audio, music, refresh } = createTourAudioChannels(root, input.labels, signal, (state) => {
    audioState = state;
    session.pause();
  });
  const visit = createTourVisit(music);
  const session = createTourPlaybackSession({
    signal,
    motion,
    hidden: () => root.ownerDocument.hidden,
    autoplay: tour.playback.autoplay,
    changed(elapsed, playing, state, mode, continuous) {
      syncPlaybackAudio(audio, {
        audioState,
        elapsed,
        entrance,
        playing: playing && elapsed < exitStart,
        state,
      });
      const view = playbackView(elapsed, state);
      update({ ...view, playing: continuous, mode });
      chrome?.update({ playing: continuous, state: view.state });
    },
    complete: advance,
  });
  function advance() {
    const route = tourAutomaticRoute(tour, index, visited, ended);
    choice = route.choice;
    if (route.finished) visit.finish();
    if (route.target === null) session.pause();
    else navigate(route.target);
  }
  function toggle() {
    audio.stop();
    audioState = null;
    if (session.continuous) {
      visit.pause();
      session.pause();
      return;
    }
    visited.clear();
    if (tour.slides[index]) visited.add(tour.slides[index].id);
    choice = false;
    if (ended || visit.completed) navigate(0, true);
    else visit.play();
    session.play();
  }
  function manual() {
    audio.stop();
    visited.clear();
    session.setManual();
  }
  function seek(value) {
    audio.stop();
    audioState = null;
    session.pause();
    const target = resolveTourSeek(timeline, index, value);
    if (target.index !== index || ended) navigate(target.index, false, true);
    session.seek(target.elapsed);
  }

  function show(nextTour, nextIndex, isEnd, nextAssets) {
    assets = nextAssets;
    tour = nextTour;
    index = nextIndex;
    ended = isEnd;
    choice = false;
    const slide = tour.slides[index];
    audioState = null;
    audio.show(ended ? null : slide, assets);
    music.configure(tour.backgroundMusic ?? null, assets);
    timeline = tourLinearTimeline(tour, reduced());
    const spec = tourPlaybackSpec(tour, ended ? null : slide, assets, reduced());
    ({ entrance, exitStart, duration } = spec);
    setVolumeAvailable(Boolean(tour.backgroundMusic) || tourHasPlayableNarration(tour, assets));
    if (!slide) {
      visit.finish();
      session.clear();
      return;
    }
    if (ended) {
      visit.finish();
      session.pause();
    }
    visited.add(slide.id);
    session.load(spec);
  }
  bindMotionPreference(
    motionPreference,
    signal,
    session,
    motion,
    () => entrance,
    () => show(tour, index, ended, assets)
  );
  const pause = bindPlaybackLifetime(root, signal, session, audio, visit, () => {
    audioState = null;
  });
  return {
    show,
    pause,
    refreshAudioControls: refresh,
    restartVisit: visit.restart,
    depart(callbacks) {
      audio.stop();
      session.depart(callbacks);
    },
    get mode() {
      return session.mode;
    },
    interact(reason) {
      visited.clear();
      audio.stop();
      session.pause();
      if (reason === 'navigation' || reason === 'point') visit.admit();
    },
  };
}
/** Narration and music share one viewer mix; snapshots stay inside their media owner. */
function createTourAudioChannels(root, labels, signal, failed) {
  const audio = createTourAudio(root, signal, failed, (snapshot) => {
    projectTourAudioControls(root, labels, snapshot);
    music.refreshMix();
  });
  createTourMusicControls(root, labels, signal);
  const music = createTourMusic(
    root,
    signal,
    () => audio.snapshot,
    (snapshot) => projectTourMusicControls(root, labels, snapshot)
  );
  root.addEventListener(
    'click',
    (event) => {
      const target =
        event.target instanceof globalThis.Element
          ? event.target.closest('[data-tour-music-mute]')
          : null;
      if (target) music.setMuted(!music.snapshot.muted);
    },
    { signal }
  );
  return {
    audio,
    music,
    refresh() {
      projectTourAudioControls(root, labels, audio.snapshot);
      projectTourMusicControls(root, labels, music.snapshot);
    },
  };
}

/** A visit is admitted by viewer commands, independently of the progression clock and media state. */
function createTourVisit(music) {
  let phase = 'idle';
  function finish() {
    phase = 'completed';
    music.finish();
  }
  function restart() {
    music.finish();
    phase = 'active';
    music.play();
  }
  return {
    finish,
    restart,
    admit() {
      if (phase === 'paused') return;
      if (phase === 'completed') music.finish();
      phase = 'active';
      music.play();
    },
    get completed() {
      return phase === 'completed';
    },
    play() {
      phase = 'active';
      music.play();
    },
    pause() {
      if (phase !== 'completed') phase = 'paused';
      music.pause();
    },
    retry() {
      if (phase === 'active') music.play();
    },
  };
}

/** Converts the shared scrub position to one slide-local clock position. */
function resolveTourSeek(timeline, index, value) {
  if (!timeline) return { index, elapsed: value };
  const target = Math.max(
    0,
    timeline.offsets.findLastIndex((offset) => offset <= value)
  );
  return { index: target, elapsed: value - timeline.offsets[target] };
}

function bindPlaybackLifetime(root, signal, session, audio, visit, clearAudioState) {
  const pause = () => {
    visit.pause();
    audio.stop();
    session.pause();
  };
  root.ownerDocument.addEventListener(
    'visibilitychange',
    () => {
      if (root.ownerDocument.hidden) pause();
    },
    { signal }
  );
  root.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof globalThis.Element && event.target.closest('a')) pause();
    },
    { signal, capture: true }
  );
  root.addEventListener(
    'click',
    (event) => {
      if (
        event.target instanceof globalThis.Element &&
        event.target.closest('[data-tour-music-retry]')
      )
        visit.retry();
    },
    { signal }
  );
  bindLocalAudioCommands(root, signal, session, audio, clearAudioState, visit);
  return pause;
}

/** Local audio detaches before pausing the timeline, whose change callback synchronizes immediately. */
function bindLocalAudioCommands(root, signal, session, audio, clearAudioState, visit) {
  root.addEventListener(
    'click',
    (event) => {
      const target =
        event.target instanceof globalThis.Element
          ? event.target.closest(
              '[data-tour-narration-toggle],[data-tour-narration-replay],[data-tour-narration],[data-tour-mute]'
            )
          : null;
      if (!target) return;
      if (target.hasAttribute('data-tour-mute')) {
        audio.setMuted(!audio.snapshot.muted);
        return;
      }
      const snapshot = audio.snapshot;
      const id = target.dataset.tourNarrationToggle ?? target.dataset.tourNarrationReplay;
      const sameCue = snapshot.objectId === id;
      const playing = snapshot.status === 'playing' || snapshot.status === 'loading';
      visit.admit();
      clearAudioState();
      audio.pause();
      session.pause();
      if (target.hasAttribute('data-tour-narration-replay')) audio.replay(id);
      else if (target.hasAttribute('data-tour-narration-toggle')) {
        if (sameCue && playing) return;
        if (sameCue && snapshot.canResume) audio.resume();
        else audio.replay(id);
      } else audio.activate(target.dataset.tourNarration);
    },
    { signal }
  );
  root.addEventListener(
    'input',
    (event) => {
      const target = event.target;
      if (target instanceof globalThis.HTMLInputElement && target.hasAttribute('data-tour-volume'))
        audio.setVolume(Number(target.value));
    },
    { signal }
  );
}

/** Timing and media source are a projection of the currently rendered slide. */
function tourPlaybackSpec(tour, slide, assets, reduced) {
  const entrance = tourEntranceTiming(tour, slide, reduced).total;
  const exitStart = entrance + (slide ? tourSlideDuration(tour, slide) : 0);
  const duration = exitStart + tourHighlightTiming(tour, slide, reduced).exitMs;
  const image = !slide ? null : slide.kind === 'image' ? slide.image : slide.background.image;
  return {
    entrance,
    exitStart,
    duration,
    source: assets.find((asset) => asset.id === image?.assetId)?.src,
    required: Boolean(image),
  };
}

/** Detached resources do not make a tour audible; a live attachment needs its playable asset. */
function tourHasPlayableNarration(tour, assets) {
  return tour.slides.some((slide) =>
    getTourNarrationTargets(slide).some(
      (target) =>
        target.narration &&
        assets.some((asset) => asset.id === target.narration.assetId && asset.src)
    )
  );
}

/** Reduced-motion changes retain the hold position while rebuilding the entrance gate. */
function bindMotionPreference(preference, signal, session, motion, getEntrance, reload) {
  preference?.addEventListener?.(
    'change',
    () => {
      if (signal.aborted) return;
      const holdElapsed = Math.max(0, session.elapsed - getEntrance());
      const resume = session.continuous;
      session.pause();
      motion.cancel({ preserveMediaGate: true });
      reload();
      session.seek(getEntrance() + holdElapsed);
      if (resume) session.play();
    },
    { signal }
  );
}

/** A missing choice pauses progression; only physical completion ends the music visit. */
function tourAutomaticRoute(tour, index, visited, ended) {
  const target = ended ? tour.slides.length : nextUnvisitedDestination(tour, index, visited);
  const finished = ended || (target === tour.slides.length && !tour.endScreen.enabled);
  return { target: finished ? null : target, choice: target === null, finished };
}

/** Loop policy belongs to route selection, not the playback clock. */
function nextUnvisitedDestination(tour, index, visited) {
  const target = tourAutoplayDestination(tour, index);
  if (target === tour.slides.length && tour.playback.loop) return 0;
  if (target === null || (!tour.playback.loop && visited.has(tour.slides[target]?.id))) return null;
  return target;
}
