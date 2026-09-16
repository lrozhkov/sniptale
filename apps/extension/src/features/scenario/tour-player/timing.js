import { getTourNarrationCues } from '../project/tour-resources';
import { tourCameraEnabled } from './camera.js';
/** Reading and narration use authored source data; returned duration is milliseconds. */
export function tourSlideDuration(tour, slide) {
  const texts =
    slide.kind === 'image'
      ? [
          slide.title,
          ...slide.hotspots.flatMap((point) => [point.label, point.text]),
          ...slide.annotations.map((note) => note.text),
        ]
      : [slide.title, slide.description, ...slide.buttons.map((button) => button.label)];
  const characters = texts.join(' ').trim().length;
  const readingSeconds = characters ? 1 + characters / 15 : 0;
  const narrationSeconds = getTourNarrationCues(slide, { kind: 'enter' }).reduce(
    (sum, cue) => sum + cue.narration.trimEnd - cue.narration.trimStart,
    0
  );
  const hold =
    slide.timing.mode === 'manual'
      ? Math.max(slide.timing.holdSeconds, slide.timing.truncateNarration ? 0 : narrationSeconds)
      : Math.max(tour.playback.minimumHoldSeconds, readingSeconds, narrationSeconds);
  return hold * 1000;
}

/** Resolves an automatic internal destination. Null means wait for a viewer choice. */
export function tourAutoplayDestination(tour, index) {
  const slide = tour.slides[index];
  if (!slide) return null;
  if (slide.timing.autoplayTarget) {
    const target = tour.slides.findIndex((entry) => entry.id === slide.timing.autoplayTarget);
    return target < 0 ? null : target;
  }
  const actions = (slide.kind === 'image' ? slide.hotspots : slide.buttons)
    .map((entry) => entry.action)
    .filter((action) => action.kind !== 'none');
  if (actions.some((action) => action.kind === 'url')) return null;
  const destinations = new Set(actions.map((action) => actionDestination(action, tour, index)));
  if (!destinations.size) return index + 1;
  return destinations.size === 1 ? [...destinations][0] : null;
}
function actionDestination(action, tour, index) {
  let target = null;
  if (action.kind === 'next') target = index + 1;
  else if (action.kind === 'previous') target = index - 1;
  else if (action.kind === 'restart') target = 0;
  else if (action.kind === 'end') target = tour.slides.length;
  else if (action.kind === 'slide')
    target = tour.slides.findIndex((slide) => slide.id === action.slideId);
  return target !== null && target >= 0 && target <= tour.slides.length ? target : null;
}

/** A branched or looping tour has no truthful global remaining-time estimate. */
export function tourLinearTimeline(tour, reducedMotion = false) {
  if (tour.playback.loop || !tour.slides.length) return null;
  const offsets = [];
  let duration = 0;
  for (const [index, slide] of tour.slides.entries()) {
    if (tourAutoplayDestination(tour, index) !== index + 1) return null;
    const objects = slide.kind === 'image' ? slide.hotspots : slide.buttons;
    if (
      objects.some(
        ({ action }) =>
          action.kind !== 'none' && actionDestination(action, tour, index) !== index + 1
      )
    )
      return null;
    offsets.push(duration);
    duration +=
      tourEntranceTiming(tour, slide, reducedMotion).total + tourSlideDuration(tour, slide);
  }
  return { offsets, duration };
}

/** Destination-only phase budgets keep seeking stable across different incoming routes. */
export function tourEntranceTiming(tour, slide, reducedMotion = false) {
  const switchMs =
    reducedMotion || tour.transition.kind === 'none' ? 0 : tour.transition.durationMs;
  const travelMs =
    !reducedMotion && slide?.kind === 'image' && slide.hotspots.length === 1
      ? tour.transition.hotspotTravelMs
      : 0;
  const camera = !reducedMotion && tourCameraEnabled(slide, tour.playback.autoZoom);
  const cameraStartMs = camera ? switchMs + (slide.camera.delayMs ?? 300) : 0;
  const cameraMs = camera ? (slide.camera.durationMs ?? 700) : 0;
  return {
    switchMs,
    travelMs,
    cameraStartMs,
    cameraMs,
    total: Math.max(switchMs + travelMs, cameraStartMs + cameraMs),
  };
}
