import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewEdit } from '../../features/video/review/types';
import { reviewTimelineNavigationBounds } from './track-projection';

/** Slider and timeline gestures use the same bounded logarithmic zoom steps. */
export function reviewWheelZoom(
  value: number,
  event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>
) {
  const delta = event.deltaY || event.deltaX;
  if (!Number.isFinite(delta) || delta === 0) return null;
  const pixels = delta * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 100 : 1);
  const step = Math.sign(pixels) * Math.max(0.1, Math.min(5, Math.abs(pixels) / 20));
  const current = Math.log2(value) * 25;
  const next = Math.max(0, Math.min(100, Math.round((current - step) * 10) / 10));
  return 2 ** (next / 25);
}

/** The viewport owns the label gutter and usable ruler width at every resize. */
export function useReviewTimelineGeometry(
  audioVisible: boolean,
  zoomVisible: boolean,
  markersCount: number
) {
  const viewport = useRef<HTMLDivElement>(null);
  const [gutter, setGutter] = useState(192);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => {
      const headers = node.querySelectorAll<HTMLElement>(
        '[data-ui="gallery.videoReview.trackHeader"]'
      );
      const natural = Math.max(
        120,
        ...Array.from(headers, (header) => {
          const label = header.querySelector<HTMLElement>('[data-track-label]');
          const controls = header.querySelector<HTMLElement>('[data-track-controls]');
          return (label?.scrollWidth ?? 0) + (controls?.scrollWidth ?? 0) + 44;
        })
      );
      const next = Math.min(Math.round(node.clientWidth * 0.4) || 260, Math.ceil(natural));
      setGutter(next);
      setWidth(Math.max(1, node.clientWidth - next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node
      .querySelectorAll('[data-track-label], [data-track-controls]')
      .forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [audioVisible, zoomVisible, markersCount]);
  return { viewport, gutter, width };
}

/** Commits admitted zoom requests after the ruler has adopted its new scale. */
export function useReviewTimelineNavigation(
  props: {
    duration: number;
    time: number;
    edits?: readonly ReviewEdit[];
    zoomAnchor?: number | null | undefined;
    beforeAction?: ReviewBeforeAction | undefined;
    onSeek(time: number, snap?: boolean): void;
  },
  { viewport, gutter, width }: ReturnType<typeof useReviewTimelineGeometry>
) {
  const [zoom, setZoom] = useState(1);
  const wheelTarget = useRef<HTMLElement>(null);
  const zoomTarget = useRef<number | null>(null);
  const navigation = useMemo(
    () => reviewTimelineNavigationBounds(props.duration, props.edits ?? []),
    [props.duration, props.edits]
  );
  useLayoutEffect(() => {
    const target = zoomTarget.current;
    zoomTarget.current = null;
    if (target !== null && viewport.current && props.duration > 0) {
      viewport.current.scrollLeft = Math.max(
        0,
        Math.min(width * (zoom - 1), (target / props.duration) * width * zoom - width / 2)
      );
      return;
    }
    if (props.time === navigation.start || props.time === navigation.end)
      revealBoundary(viewport.current, props.time, navigation, props.duration, gutter, width, zoom);
  }, [props.time, navigation, props.duration, zoom, gutter, width, viewport]);
  const navigate = (target: number) => {
    (props.beforeAction ?? ((action) => action()))(() => {
      props.onSeek(target, false);
      revealBoundary(viewport.current, target, navigation, props.duration, gutter, width, zoom);
    });
  };
  const { beforeAction, zoomAnchor, time } = props;
  const onZoom = useCallback(
    (value: number) =>
      (beforeAction ?? ((action) => action()))(() => {
        if (value === zoom) return;
        zoomTarget.current = zoomAnchor ?? time;
        setZoom(value);
      }),
    [beforeAction, zoomAnchor, time, zoom]
  );
  useEffect(() => {
    const node = wheelTarget.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      const next = reviewWheelZoom(zoom, event);
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (next !== zoom) onZoom(next);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [zoom, onZoom]);
  return { zoom, navigation, navigate, onZoom, wheelTarget };
}

function revealBoundary(
  node: HTMLDivElement | null,
  target: number,
  navigation: { start: number; end: number },
  duration: number,
  gutter: number,
  width: number,
  zoom: number
) {
  if (!node || duration <= 0) return;
  const x = gutter + (target / duration) * width * zoom;
  if (x < node.scrollLeft + 16 || x > node.scrollLeft + node.clientWidth - 24)
    node.scrollLeft = target === navigation.start ? 0 : Math.max(0, x - node.clientWidth + 24);
}

/** Tool activation reveals its lane through the existing vertical viewport, preserving horizontal position. */
export function useReviewToolLaneNavigation(
  viewport: RefObject<HTMLDivElement | null>,
  tools: { focus: boolean; original: boolean; source: boolean; annotation?: boolean }
) {
  const active = tools.focus
    ? 'focus'
    : tools.original
      ? 'original'
      : tools.source
        ? 'source'
        : tools.annotation
          ? 'annotation'
          : null;
  useEffect(() => {
    if (!active || !viewport.current) return;
    const selectors = {
      annotation: '[data-ui="gallery.videoReview.annotationEffectsLane"]',
      focus: '[data-ui="gallery.videoReview.zoomLane"]',
      original: '[data-original-audio-lane]',
      source: '[data-ui="gallery.videoReview.sourceLane"]',
    };
    const lane = viewport.current.querySelector<HTMLElement>(selectors[active]);
    if (!lane) return;
    const bounds = viewport.current.getBoundingClientRect();
    const rect = lane.getBoundingClientRect();
    const ruler = viewport.current.querySelector('[data-ui="gallery.videoReview.rulerRow"]');
    const visibleTop = bounds.top + (ruler?.getBoundingClientRect().height ?? 0);
    if (rect.top < visibleTop || rect.bottom > bounds.bottom)
      viewport.current.scrollTop += rect.top - visibleTop - 4;
  }, [active, viewport]);
  return active;
}
