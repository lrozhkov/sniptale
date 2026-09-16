import { createTourAudio } from './audio.js';
import { createTourPlaybackSession } from './playback-session.js';
import {
  tourSlideDuration,
  tourAutoplayDestination,
  tourLinearTimeline,
  tourEntranceTiming,
} from './timing.js';
import { createTourTransport } from './transport.js';

/** Projects transport and route policy; the session owns media readiness and the single clock. */
export function createTourPlayback(root, input, signal, motion, navigate, silent = false) {
  let tour = input.tour;
  let index = 0;
  let ended = false;
  let duration = 0;
  let entrance = 0;
  let assets = input.assets;
  let timeline = null;
  let choice = false;
  const visited = new Set();
  const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => Boolean(motionPreference?.matches);
  const update = createTourTransport(root, input.labels, signal, toggle, seek);
  let audioState = null;
  const audio = createTourAudio(root, signal, (state) => {
    audioState = state;
    session.pause();
  });
  const session = createTourPlaybackSession({
    signal,
    motion,
    hidden: () => root.ownerDocument.hidden,
    autoplay: tour.playback.autoplay && !root.ownerDocument.hidden,
    changed(elapsed, playing, state) {
      if (!audioState)
        audio.sync(
          Math.max(0, elapsed - entrance) / 1000,
          playing && state === 'ready' && elapsed >= entrance && !audioState
        );
      update({
        elapsed: ended
          ? (timeline?.duration ?? duration)
          : (timeline?.offsets[index] ?? 0) + elapsed,
        duration: timeline?.duration ?? duration,
        playing,
        state: audioState ?? (choice ? 'choice' : ended && state !== 'loading' ? 'ended' : state),
      });
    },
    complete: advance,
  });
  function advance() {
    if (ended) {
      session.pause();
      return;
    }
    const target = nextUnvisitedDestination(tour, index, visited);
    if (target === null) {
      choice = true;
      session.pause();
      return;
    }
    if (target === tour.slides.length && !tour.endScreen.enabled) {
      session.pause();
      return;
    }
    navigate(target);
  }
  function toggle() {
    audio.stop();
    audioState = null;
    if (session.playing) {
      session.pause();
      return;
    }
    visited.clear();
    if (tour.slides[index]) visited.add(tour.slides[index].id);
    choice = false;
    if (ended) navigate(0, true);
    session.play();
  }
  function seek(value) {
    audio.stop();
    audioState = null;
    session.pause();
    if (timeline) {
      const target = Math.max(
        0,
        timeline.offsets.findLastIndex((offset) => offset <= value)
      );
      const offset = timeline.offsets[target];
      if (target !== index || ended) navigate(target);
      session.seek(value - offset);
    } else {
      if (ended) navigate(index);
      session.seek(value);
    }
  }
  function show(nextTour, nextIndex, isEnd, nextAssets) {
    assets = nextAssets;
    tour = nextTour;
    index = nextIndex;
    ended = isEnd;
    choice = false;
    const slide = tour.slides[index];
    audioState = null;
    audio.show(ended || silent ? null : slide, assets);
    timeline = tourLinearTimeline(tour, reduced());
    entrance = tourEntranceTiming(tour, ended ? null : slide, reduced()).total;
    duration = entrance + (slide && !ended ? tourSlideDuration(tour, slide) : 0);
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
  const pause = () => {
    audio.stop();
    session.pause();
  };
  bindPlaybackLifetime(root, signal, pause);
  bindNarrationActivation(root, signal, (id) => {
    session.pause();
    audioState = null;
    audio.activate(id);
  });
  return {
    show,
    pause,
    interact() {
      visited.clear();
      pause();
    },
  };
}
function bindPlaybackLifetime(root, signal, pause) {
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
}

function bindNarrationActivation(root, signal, activate) {
  root.addEventListener(
    'click',
    (event) => {
      const target =
        event.target instanceof globalThis.Element
          ? event.target.closest('[data-tour-narration]')
          : null;
      if (!target) return;
      activate(target.dataset.tourNarration);
    },
    { signal }
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
