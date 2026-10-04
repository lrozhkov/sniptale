import { createTourAudio } from './audio.js';
import { createTourPlaybackSession } from './playback-session.js';
import {
  tourSlideDuration,
  tourAutoplayDestination,
  tourLinearTimeline,
  tourEntranceTiming,
  tourHighlightTiming,
} from './timing.js';
import { createTourTransport } from './transport.js';

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
  const playbackView = (elapsed, state) => ({
    elapsed: ended ? (timeline?.duration ?? duration) : (timeline?.offsets[index] ?? 0) + elapsed,
    duration: timeline?.duration ?? duration,
    state: audioState ?? (choice ? 'choice' : ended && state !== 'loading' ? 'ended' : state),
  });
  let audioState = null;
  const audio = createTourAudio(root, signal, (state) => {
    audioState = state;
    session.pause();
  });
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
    const target = ended ? tour.slides.length : nextUnvisitedDestination(tour, index, visited);
    if (target === null) {
      choice = true;
      session.pause();
      return;
    }
    if (ended || (target === tour.slides.length && !tour.endScreen.enabled)) {
      session.pause();
      return;
    }
    navigate(target);
  }
  function toggle() {
    audio.stop();
    audioState = null;
    if (session.continuous) {
      session.pause();
      return;
    }
    visited.clear();
    if (tour.slides[index]) visited.add(tour.slides[index].id);
    choice = false;
    if (ended) navigate(0, true);
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
    timeline = tourLinearTimeline(tour, reduced());
    entrance = tourEntranceTiming(tour, ended ? null : slide, reduced()).total;
    exitStart = entrance + (slide && !ended ? tourSlideDuration(tour, slide) : 0);
    duration = exitStart + tourHighlightTiming(tour, ended ? null : slide, reduced()).exitMs;
    if (!slide) {
      session.clear();
      return;
    }
    if (ended) session.pause();
    visited.add(slide.id);
    const image = ended ? null : slide.kind === 'image' ? slide.image : slide.background.image;
    session.load({
      duration,
      entrance,
      exitStart,
      source: assets.find((asset) => asset.id === image?.assetId)?.src,
      required: Boolean(image),
    });
  }
  bindMotionPreference(
    motionPreference,
    signal,
    session,
    motion,
    () => entrance,
    () => show(tour, index, ended, assets)
  );
  const pause = bindPlaybackLifetime(root, signal, session, audio, () => {
    audioState = null;
  });
  return {
    show,
    pause,
    depart(callbacks) {
      audio.stop();
      session.depart(callbacks);
    },
    get mode() {
      return session.mode;
    },
    interact() {
      visited.clear();
      pause();
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

function bindPlaybackLifetime(root, signal, session, audio, clearAudioState) {
  const pause = () => {
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
      const target =
        event.target instanceof globalThis.Element
          ? event.target.closest('[data-tour-narration]')
          : null;
      if (!target) return;
      clearAudioState();
      session.pause();
      audio.activate(target.dataset.tourNarration);
    },
    { signal }
  );
  return pause;
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

/** Loop policy belongs to route selection, not the playback clock. */
function nextUnvisitedDestination(tour, index, visited) {
  const target = tourAutoplayDestination(tour, index);
  if (target === tour.slides.length && tour.playback.loop) return 0;
  if (target === null || (!tour.playback.loop && visited.has(tour.slides[target]?.id))) return null;
  return target;
}
