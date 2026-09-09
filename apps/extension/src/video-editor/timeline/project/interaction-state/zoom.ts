import {
  clampTimelineScale,
  MAX_TIMELINE_PIXELS_PER_SECOND,
  MIN_TIMELINE_PIXELS_PER_SECOND,
} from '../../../contracts/timeline-scale';

export interface TimelineZoomContext {
  duration: number;
  viewportWidth: number;
  fps: number;
}

export function resolveTimelineZoomBounds(context?: TimelineZoomContext) {
  if (!context) return { min: MIN_TIMELINE_PIXELS_PER_SECOND, max: MAX_TIMELINE_PIXELS_PER_SECOND };
  const fps = Math.max(1, context.fps);
  const min = clampTimelineScale(
    Math.max(240, context.viewportWidth - 96) / Math.max(1, context.duration)
  );
  return { min, max: clampTimelineScale(Math.max(min * 2, fps * 16)) };
}

export function mapTimelineZoomSliderToPixelsPerSecond(
  sliderValue: number,
  context?: TimelineZoomContext
): number {
  const fraction = Math.min(1, Math.max(0, sliderValue / 100));
  const { min, max } = resolveTimelineZoomBounds(context);
  return clampTimelineScale(min * (max / min) ** fraction);
}

export function mapTimelinePixelsPerSecondToSliderValue(
  pixelsPerSecond: number,
  context?: TimelineZoomContext
): number {
  const { min, max } = resolveTimelineZoomBounds(context);
  return (
    Math.round(
      (1000 * Math.log(Math.min(max, Math.max(min, pixelsPerSecond)) / min)) / Math.log(max / min)
    ) / 10
  );
}
