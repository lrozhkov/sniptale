import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
  type RefObject,
} from 'react';
import { nearestReviewBoundary } from '../../features/video/review/cuts';
import { reviewTimeLabel } from './controls';
import { planeTime, reviewPlaneLane } from './timeline-drag';

type HoverLane = 'annotation' | 'source' | 'focus' | 'original' | 'seek' | 'ruler';
type Hover = { time: number; x: number; snapped: boolean; lane: HoverLane };
export type ReviewPlacementHints = Partial<
  Record<'source' | 'focus' | 'original', string | undefined>
>;
type HoverOptions = {
  placementHints?: ReviewPlacementHints | undefined;
  busy: boolean;
  duration: number;
  gutter: number;
  width: number;
  zoom: number;
  annotationEnabled?: boolean;
  focusEnabled: boolean;
  originalEnabled: boolean;
  sourceRangeTool: boolean;
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
      options.annotationEnabled,
      options.focusEnabled,
      options.originalEnabled,
      options.sourceRangeTool,
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
    if (
      event.target instanceof Element &&
      event.target.closest(
        '[data-ui="gallery.videoReview.webcamTrack"],[data-ui="gallery.videoReview.historyTrack"]'
      )
    ) {
      setHover(null);
      return;
    }
    const hit =
      activeLane ??
      reviewPlaneLane(
        event.target,
        options.focusEnabled,
        options.originalEnabled,
        options.sourceRangeTool,
        options.annotationEnabled
      );
    if (hit === 'control' || hit === 'item') {
      setHover(null);
      return;
    }
    const lane = hit === 'gap' ? 'seek' : hit;
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
  const blocked =
    hover && (hover.lane === 'source' || hover.lane === 'focus' || hover.lane === 'original')
      ? options.placementHints?.[hover.lane]
      : undefined;
  return {
    reason: blocked,
    move,
    clear: () => setHover(null),
    cursor: blocked
      ? 'crosshair'
      : !options.busy && hover && hover.lane !== 'seek'
        ? rangeCursor
        : 'default',
    hover,
  };
}

/** Preview marker stays above the sticky ruler (z-40) and never captures input. */
export function ReviewTimelineHoverGuide(props: {
  hover: Hover | null;
  resizing?: boolean;
  label?: ReactNode;
  viewport: RefObject<HTMLDivElement | null>;
  gutter: number;
  width: number;
}) {
  const { hover } = props;
  const active = hover !== null;
  const label = useRef<HTMLSpanElement>(null);
  const [labelWidth, setLabelWidth] = useState(70);
  useLayoutEffect(() => {
    const node = label.current;
    if (!node) return;
    const measure = () => setLabelWidth(node.getBoundingClientRect().width);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [props.label, active]);
  if (!hover) return null;
  const viewportRight =
    (props.viewport.current?.scrollLeft ?? 0) +
    (props.viewport.current?.clientWidth ?? props.gutter + props.width);
  if (hover.x < (props.viewport.current?.scrollLeft ?? 0) + props.gutter || hover.x > viewportRight)
    return null;
  const leftLimit = (props.viewport.current?.scrollLeft ?? 0) + props.gutter - hover.x;
  const labelOffset = Math.max(leftLimit, Math.min(4, viewportRight - hover.x - labelWidth));
  return (
    <div
      data-ui="gallery.videoReview.hoverTime"
      data-resizing={props.resizing ? 'true' : undefined}
      aria-hidden="true"
      data-snapped={hover.snapped ? 'true' : undefined}
      className="pointer-events-none absolute bottom-2 top-0 z-[41] w-px
        bg-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_60%,transparent)]"
      style={{ left: hover.x }}
    >
      <span
        ref={label}
        className="sticky top-0 block w-max whitespace-nowrap rounded bg-[var(--sniptale-color-surface-panel)]
          px-1 text-[11px] text-[var(--sniptale-color-text-primary)] shadow-sm"
        style={{
          transform: `translateX(${labelOffset}px)`,
        }}
      >
        {props.label ?? reviewTimeLabel(hover.time)}
      </span>
    </div>
  );
}
