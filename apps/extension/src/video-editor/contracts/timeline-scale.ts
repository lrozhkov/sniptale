export const MIN_TIMELINE_PIXELS_PER_SECOND = 0.005;
export const MAX_TIMELINE_PIXELS_PER_SECOND = 23040;

/** Keeps every timeline view consumer on the same finite pixels-per-second scale. */
export function clampTimelineScale(value: number): number {
  return Number.isNaN(value)
    ? 90
    : Math.min(MAX_TIMELINE_PIXELS_PER_SECOND, Math.max(MIN_TIMELINE_PIXELS_PER_SECOND, value));
}
