import {
  resolveTourHighlightAnimation,
  getTourHotspots,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { getTourNarrationCues } from '../project/tour-resources';
import { tourCameraEnabled } from './camera.js';
/** Reading and narration use authored source data; returned duration is milliseconds. */
export function tourSlideDuration(tour, slide) {
  const texts =
    slide.kind === 'image'
      ? [
          ...getTourHotspots(slide).flatMap((point) => [point.label, point.text]),
          ...slide.actions
            .filter((entry) => entry.type === 'annotation')
            .map((entry) => entry.object.text),
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
  return slide.kind === 'navigation' ? null : index + 1;
}

/** Entry durations share one timeline even when contents pauses automatic progression. */
export function tourLinearTimeline(tour, reducedMotion = false) {
  if (!tour.slides.length) return null;
  const offsets = [];
  let duration = 0;
  for (const slide of tour.slides) {
    offsets.push(duration);
    duration +=
      tourEntranceTiming(tour, slide, reducedMotion).total +
      tourSlideDuration(tour, slide) +
      tourHighlightTiming(tour, slide, reducedMotion).exitMs;
  }
  return { offsets, duration };
}

/** Destination-only phase budgets keep seeking stable across different incoming routes. */
export function tourEntranceTiming(tour, slide, reducedMotion = false) {
  const index = tour.slides.indexOf(slide);
  const previous = tour.slides[index - 1];
  const sameSource = slide?.sourceSlideId && slide.sourceSlideId === previous?.sourceSlideId;
  const switchMs =
    reducedMotion || sameSource || tour.transition.kind === 'none' ? 0 : tour.transition.durationMs;
  const travelMs =
    !reducedMotion &&
    slide?.kind === 'image' &&
    getTourHotspots(slide).length === 1 &&
    getTourHotspots(slide)[0].visual.kind === 'point'
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
    total: Math.max(
      switchMs + travelMs,
      cameraStartMs + cameraMs,
      tourHighlightTiming(tour, slide, reducedMotion).enterMs
    ),
  };
}

/** Concurrent highlight phases use the longest duration, independent of reading/narration hold. */
export function tourHighlightTiming(tour, slide, reducedMotion = false) {
  const result = { enterMs: 0, exitMs: 0 };
  if (reducedMotion || slide?.kind !== 'image') return result;
  const animations = [
    ...slide.masks.map((mask) => resolveTourHighlightAnimation(mask, tour.style.maskDefaults)),
    ...getTourHotspots(slide).flatMap((hotspot) =>
      hotspot.visual.kind === 'point' ? [] : [hotspot.visual.animation]
    ),
  ];
  for (const phases of animations) {
    if (phases.enter.kind === 'fade')
      result.enterMs = Math.max(result.enterMs, phases.enter.durationMs);
    if (phases.exit.kind === 'fade')
      result.exitMs = Math.max(result.exitMs, phases.exit.durationMs);
  }
  return result;
}
