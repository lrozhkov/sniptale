const TIMELINE_ZOOM_SLIDER_MIN = 0;
const TIMELINE_ZOOM_SLIDER_MAX = 100;
const TIMELINE_ZOOM_PPS_MIN = 12;
const TIMELINE_ZOOM_PPS_MAX = 280;

function clampNormalizedZoomValue(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function clampTimelinePixelsPerSecond(value: number): number {
  return Math.min(TIMELINE_ZOOM_PPS_MAX, Math.max(TIMELINE_ZOOM_PPS_MIN, Math.round(value)));
}

export function mapTimelineZoomSliderToPixelsPerSecond(sliderValue: number): number {
  const normalizedValue =
    (sliderValue - TIMELINE_ZOOM_SLIDER_MIN) /
    (TIMELINE_ZOOM_SLIDER_MAX - TIMELINE_ZOOM_SLIDER_MIN);
  const curvedValue = clampNormalizedZoomValue(normalizedValue) ** 2;

  return Math.round(
    TIMELINE_ZOOM_PPS_MIN + curvedValue * (TIMELINE_ZOOM_PPS_MAX - TIMELINE_ZOOM_PPS_MIN)
  );
}

export function mapTimelinePixelsPerSecondToSliderValue(pixelsPerSecond: number): number {
  const normalizedValue =
    (pixelsPerSecond - TIMELINE_ZOOM_PPS_MIN) / (TIMELINE_ZOOM_PPS_MAX - TIMELINE_ZOOM_PPS_MIN);

  return Math.round(
    TIMELINE_ZOOM_SLIDER_MIN +
      Math.sqrt(clampNormalizedZoomValue(normalizedValue)) *
        (TIMELINE_ZOOM_SLIDER_MAX - TIMELINE_ZOOM_SLIDER_MIN)
  );
}
