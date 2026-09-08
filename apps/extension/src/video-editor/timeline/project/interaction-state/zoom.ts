import {
  clampTimelineScale,
  MAX_TIMELINE_PIXELS_PER_SECOND,
  MIN_TIMELINE_PIXELS_PER_SECOND,
} from '../../../contracts/timeline-scale';

export function mapTimelineZoomSliderToPixelsPerSecond(sliderValue: number): number {
  const fraction = Math.min(1, Math.max(0, sliderValue / 100));
  return clampTimelineScale(
    MIN_TIMELINE_PIXELS_PER_SECOND *
      (MAX_TIMELINE_PIXELS_PER_SECOND / MIN_TIMELINE_PIXELS_PER_SECOND) ** fraction
  );
}

export function mapTimelinePixelsPerSecondToSliderValue(pixelsPerSecond: number): number {
  return Math.round(
    (100 * Math.log(clampTimelineScale(pixelsPerSecond) / MIN_TIMELINE_PIXELS_PER_SECOND)) /
      Math.log(MAX_TIMELINE_PIXELS_PER_SECOND / MIN_TIMELINE_PIXELS_PER_SECOND)
  );
}
