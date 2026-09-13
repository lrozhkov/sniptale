import { createTourPlaybackSession } from './playback-session.js';
import {
  tourSlideDuration,
  tourAutoplayDestination,
  tourLinearTimeline,
  tourEntranceTiming,
} from './timing.js';
import { createTourTransport } from './transport.js';

/** Projects transport and route policy; the session owns media readiness and the single clock. */
export function createTourPlayback(root, input, signal, motion, navigate) {
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
  const session = createTourPlaybackSession({
    signal,
    motion,
    hidden: () => root.ownerDocument.hidden,
    autoplay: tour.playback.autoplay && !root.ownerDocument.hidden,
    changed(elapsed, playing, state) {
      update({
        elapsed: ended
          ? (timeline?.duration ?? duration)
          : (timeline?.offsets[index] ?? 0) + elapsed,
        duration: timeline?.duration ?? duration,
        playing,
        state: choice ? 'choice' : ended && state !== 'loading' ? 'ended' : state,
      });
    },
    complete: advance,
  });
  function advance() {
    if (ended) {
      session.pause();
      return;
    }
    let target = tourAutoplayDestination(tour, index);
    if (target === tour.slides.length && tour.playback.loop) target = 0;
    if (target === null || (!tour.playback.loop && visited.has(tour.slides[target]?.id))) {
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
  motionPreference?.addEventListener?.(
    'change',
    () => {
      if (signal.aborted) return;
      const holdElapsed = Math.max(0, session.elapsed - entrance);
      const resume = session.continuous;
      motion.cancel({ preserveMediaGate: true });
      show(tour, index, ended, assets);
      session.seek(entrance + holdElapsed);
      if (resume) session.play();
    },
    { signal }
  );
  bindPlaybackLifetime(root, signal, session.pause);
  return {
    show,
    pause: session.pause,
    interact() {
      visited.clear();
      session.pause();
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
