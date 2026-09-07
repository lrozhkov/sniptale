const MAX_SCROLL_SURFACE_WIDTH = 30_000_000;
const RENDER_OVERSCAN = 120;

/** Precise time window, independent of the native scrollbar's rounded position. */
export interface TimelineProjection {
  startTime: number;
  endTime: number;
  pixelsPerSecond: number;
  viewportWidth: number;
  maxStartTime: number;
  scrollWidth: number;
  scrollLeft: number;
}

/** Builds the view projection from validated project timing and positive view dimensions. */
export function createTimelineProjection(params: {
  extentSeconds: number;
  pixelsPerSecond: number;
  viewportWidth: number;
  startTime: number;
}): TimelineProjection {
  const { pixelsPerSecond, viewportWidth } = params;
  const maxStartTime = Math.max(0, params.extentSeconds - viewportWidth / pixelsPerSecond);
  const startTime = Math.min(maxStartTime, Math.max(0, params.startTime));
  const scrollWidth = Math.max(
    viewportWidth,
    Math.min(MAX_SCROLL_SURFACE_WIDTH, params.extentSeconds * pixelsPerSecond)
  );
  const scrollLeft =
    maxStartTime > 0 ? (startTime / maxStartTime) * (scrollWidth - viewportWidth) : 0;
  return {
    startTime,
    endTime: startTime + viewportWidth / pixelsPerSecond,
    pixelsPerSecond,
    viewportWidth,
    maxStartTime,
    scrollWidth,
    scrollLeft,
  };
}

/** Projects absolute time to a viewport-local coordinate, without a huge intermediate CSS offset. */
export function timelineTimeToViewportX(view: TimelineProjection, time: number): number {
  return (time - view.startTime) * view.pixelsPerSecond;
}

/** Resolves pointer coordinates through the same precise window as rendered geometry. */
export function timelineViewportXToTime(view: TimelineProjection, x: number): number {
  return view.startTime + x / view.pixelsPerSecond;
}

/** Native scrollbar input is coarse navigation; never use this to acknowledge a precise seek. */
export function timelineScrollLeftToTime(view: TimelineProjection, scrollLeft: number): number {
  const maxScroll = view.scrollWidth - view.viewportWidth;
  return maxScroll > 0 ? Math.min(1, Math.max(0, scrollLeft / maxScroll)) * view.maxStartTime : 0;
}

/** Clips an interval before emitting CSS geometry, preserving source-local offset and true edges. */
export function projectTimelineInterval(view: TimelineProjection, start: number, end: number) {
  const overscanSeconds = RENDER_OVERSCAN / view.pixelsPerSecond;
  const visibleStart = Math.max(start, view.startTime - overscanSeconds);
  const visibleEnd = Math.min(end, view.endTime + overscanSeconds);
  if (visibleEnd <= visibleStart) return null;
  return {
    left: timelineTimeToViewportX(view, visibleStart),
    width: (visibleEnd - visibleStart) * view.pixelsPerSecond,
    offsetSeconds: visibleStart - start,
    durationSeconds: visibleEnd - visibleStart,
    includesStart: visibleStart === start,
    includesEnd: visibleEnd === end,
  };
}

/** Omits offscreen point markers before they can expand the native scroll surface. */
export function projectTimelinePoint(view: TimelineProjection, time: number): number | null {
  const x = timelineTimeToViewportX(view, time);
  return x < -RENDER_OVERSCAN || x > view.viewportWidth + RENDER_OVERSCAN ? null : x;
}
