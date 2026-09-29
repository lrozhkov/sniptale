import { useEffect, useState, type PointerEvent, type RefObject } from 'react';
import { nearestReviewBoundary } from '../../features/video/review/cuts';
import { reviewTimeLabel } from './controls';
import { planeTime, reviewPlaneLane } from './timeline-drag';

type HoverLane = 'source' | 'focus' | 'original' | 'seek';
type Hover = { time: number; x: number; snapped: boolean; lane: HoverLane };
type HoverOptions = {
  busy: boolean;
  duration: number;
  gutter: number;
  width: number;
  zoom: number;
  focusEnabled: boolean;
  originalEnabled: boolean;
  snapRangePreview: boolean;
  boundaries: readonly number[] | undefined;
};

// The visible time stroke and the browser hotspot both use x=4. SVG stays sharp at device scale.
const cursorSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
  '<path d="M4 2v28" stroke="#fff" stroke-width="4"/>',
  '<path d="M4 2v28" stroke="#17212b" stroke-width="2"/>',
  '<path d="M15 9h12M21 3v12" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  '<path d="M15 9h12M21 3v12" stroke="#17212b" stroke-width="2" stroke-linecap="round"/>',
  '</svg>',
].join('');
const rangeCursor = `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") 4 16, cell`;

/** Hover is advisory; pointer gestures keep their own capture and commit owner. */
export function useReviewTimelineHover(options: HoverOptions) {
  const [hover, setHover] = useState<Hover | null>(null);
  useEffect(
    () => setHover(null),
    [
      options.zoom,
      options.gutter,
      options.width,
      options.busy,
      options.focusEnabled,
      options.originalEnabled,
    ]
  );
  const move = (event: PointerEvent<HTMLDivElement>, activeLane?: HoverLane) => {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    if (options.busy || x < options.gutter || x > bounds.width) {
      setHover(null);
      return;
    }
    const lane =
      activeLane ?? reviewPlaneLane(event.target, options.focusEnabled, options.originalEnabled);
    if (lane === 'control' || lane === 'item') {
      setHover(null);
      return;
    }
    const pointerTime = planeTime(event, options.duration, options.gutter);
    const time =
      lane === 'source' && options.snapRangePreview && options.boundaries?.length
        ? nearestReviewBoundary(pointerTime, options.boundaries)
        : pointerTime;
    setHover({
      time,
      x:
        time === pointerTime
          ? x
          : options.gutter + (time / options.duration) * (bounds.width - options.gutter),
      snapped: time !== pointerTime,
      lane,
    });
  };
  return {
    move,
    clear: () => setHover(null),
    cursor: !options.busy && hover && hover.lane !== 'seek' ? rangeCursor : 'default',
    hover,
  };
}

/** Preview marker stays over the plane and never captures input. */
export function ReviewTimelineHoverGuide(props: {
  hover: Hover | null;
  viewport: RefObject<HTMLDivElement | null>;
  gutter: number;
  width: number;
}) {
  const { hover } = props;
  if (!hover) return null;
  const viewportRight =
    (props.viewport.current?.scrollLeft ?? 0) +
    (props.viewport.current?.clientWidth ?? props.gutter + props.width);
  return (
    <div
      data-ui="gallery.videoReview.hoverTime"
      aria-hidden="true"
      data-snapped={hover.snapped ? 'true' : undefined}
      className="pointer-events-none absolute bottom-2 top-0 z-[19] w-px bg-[var(--sniptale-color-accent-emphasis)]/70"
      style={{ left: hover.x }}
    >
      <span
        className="absolute top-0 whitespace-nowrap rounded bg-[var(--sniptale-color-surface-panel)]
          px-1 text-[11px] text-[var(--sniptale-color-text-primary)] shadow-sm"
        style={{
          transform:
            hover.x > viewportRight - 70 ? 'translateX(calc(-100% - 4px))' : 'translateX(4px)',
        }}
      >
        {reviewTimeLabel(hover.time)}
      </span>
    </div>
  );
}
