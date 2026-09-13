import { createTourClock } from './clock.js';
import { tourSlideDuration, tourAutoplayDestination, tourLinearTimeline } from './timing.js';
import { createTourTransport } from './transport.js';
import { waitForTourImage } from './media.js';

/** Binds one clock to current media and requests navigation from the existing controller. */
export function createTourPlayback(root, input, signal, navigate) {
  let tour = input.tour;
  let index = 0;
  let ended = false;
  let wanted = tour.playback.autoplay && !root.ownerDocument.hidden;
  let state = 'empty';
  let duration = 0;
  let timeline = null;
  let generation = 0;
  let loading = null;
  const visited = new Set();
  const update = createTourTransport(root, input.labels, signal, toggle, seek);
  const clock = createTourClock({
    now: () => performance.now(),
    requestFrame: (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame: (id) => globalThis.cancelAnimationFrame(id),
    onChange: (elapsed) => paint(elapsed),
    onComplete: advance,
  });
  function paint(elapsed = clock.elapsed) {
    update({
      elapsed: ended ? (timeline?.duration ?? duration) : (timeline?.offsets[index] ?? 0) + elapsed,
      duration: timeline?.duration ?? duration,
      playing: wanted,
      state,
    });
  }
  function pause() {
    wanted = false;
    clock.pause();
  }
  function advance() {
    let target = tourAutoplayDestination(tour, index);
    if (target === tour.slides.length && tour.playback.loop) target = 0;
    if (target === null || (!tour.playback.loop && visited.has(tour.slides[target]?.id))) {
      state = 'choice';
      pause();
      return;
    }
    if (target === tour.slides.length && !tour.endScreen.enabled) {
      pause();
      return;
    }
    navigate(target);
  }
  function toggle() {
    if (wanted) {
      pause();
      return;
    }
    visited.clear();
    if (tour.slides[index]) visited.add(tour.slides[index].id);
    wanted = true;
    if (ended) navigate(0, true);
    else if (state === 'error') show(tour, index, false, input.assets);
    else {
      if (clock.elapsed >= duration) clock.seek(0);
      if (state === 'choice') state = 'ready';
      if (state === 'ready') clock.play();
      else paint();
    }
  }
  function seek(value) {
    pause();
    if (timeline) {
      let target = timeline.offsets.findLastIndex((offset) => offset <= value);
      target = Math.max(0, target);
      const offset = timeline.offsets[target];
      if (target !== index || ended) navigate(target);
      clock.seek(value - offset);
    } else {
      if (ended) navigate(index);
      clock.seek(value);
    }
  }
  function show(nextTour, nextIndex, isEnd, assets) {
    tour = nextTour;
    index = nextIndex;
    ended = isEnd;
    input = { ...input, assets };
    loading?.abort();
    const token = ++generation;
    const slide = tour.slides[index];
    timeline = tourLinearTimeline(tour);
    duration = slide ? tourSlideDuration(tour, slide) : 0;
    state = !slide ? 'empty' : ended ? 'ended' : 'loading';
    if (ended || !slide) wanted = false;
    clock.reset(duration);
    if (ended || !slide) {
      paint();
      return;
    }
    visited.add(slide.id);
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    const source = assets.find((asset) => asset.id === image?.assetId)?.src;
    loading = new AbortController();
    const ready =
      image && !source
        ? Promise.reject(new Error('Missing image.'))
        : waitForTourImage(source, loading.signal);
    ready
      .then(() => {
        if (signal.aborted || token !== generation) return;
        state = 'ready';
        if (wanted) clock.play();
        else paint();
      })
      .catch(() => {
        if (signal.aborted || token !== generation) return;
        state = 'error';
        pause();
      });
  }
  bindPlaybackLifetime(root, signal, pause, () => {
    generation += 1;
    loading?.abort();
    clock.dispose();
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

function bindPlaybackLifetime(root, signal, pause, dispose) {
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
  signal.addEventListener('abort', dispose, { once: true });
}
