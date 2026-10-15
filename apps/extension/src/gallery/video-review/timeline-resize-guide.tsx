import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { translate, formatNumber, useAppLocale } from '../../platform/i18n';
import { ReviewTimelineHoverGuide } from './timeline-hover';

type Range = { start: number; end: number };
type Durations = { before: number; after: number };
type Boundary = { gesture: object; time: number; durations?: Durations | undefined };
type PublishBoundary = (gesture: object, time: number | null, durations?: Durations) => void;
const BoundaryContext = createContext<PublishBoundary>(() => {});

/** One disposable visual owner; track owners retain capture, constraints and commit authority. */
export function ReviewTimelineResizeGuide(
  props: Parameters<typeof ReviewTimelineHoverGuide>[0] & {
    duration: number;
    children: ReactNode;
  }
) {
  const [boundary, setBoundary] = useState<Boundary | null>(null);
  const [, refreshScroll] = useState(0);
  const publish = useCallback<PublishBoundary>((gesture, time, durations) => {
    setBoundary((current) =>
      time === null
        ? current?.gesture === gesture
          ? null
          : current
        : current?.gesture === gesture &&
            current.time === time &&
            current.durations?.before === durations?.before &&
            current.durations?.after === durations?.after
          ? current
          : { gesture, time, durations }
    );
  }, []);
  const active = boundary !== null;
  useEffect(() => {
    const viewport = props.viewport.current;
    if (!active || !viewport) return;
    const refresh = () => refreshScroll((value) => value + 1);
    viewport.addEventListener('scroll', refresh);
    return () => viewport.removeEventListener('scroll', refresh);
  }, [active, props.viewport]);
  return (
    <BoundaryContext value={publish}>
      {props.children}
      <ReviewTimelineHoverGuide
        {...props}
        resizing={active}
        label={boundary?.durations ? <ResizeDuration {...boundary.durations} /> : undefined}
        hover={
          boundary
            ? {
                time: boundary.time,
                x: props.gutter + (boundary.time / Math.max(0.001, props.duration)) * props.width,
                snapped: false,
                lane: 'seek',
              }
            : props.hover
        }
      />
    </BoundaryContext>
  );
}

/** Publish the accepted source edge; stale cleanup cannot remove another gesture's guide. */
export function useReviewResizeBoundary(
  gesture: object | null,
  time: number | null,
  original?: Range | null,
  current?: Range | null
) {
  const before = original ? original.end - original.start : undefined;
  const after = current ? current.end - current.start : undefined;
  const publish = useContext(BoundaryContext);
  useLayoutEffect(() => {
    if (!gesture || time === null) return;
    publish(
      gesture,
      time,
      before !== undefined && after !== undefined ? { before, after } : undefined
    );
    return () => publish(gesture, null);
  }, [gesture, time, before, after, publish]);
}

function ResizeDuration({ before, after }: Durations) {
  const locale = useAppLocale();
  const initial = Math.round(Math.max(0, before) * 100);
  const current = Math.round(Math.max(0, after) * 100);
  const delta = current - initial;
  const seconds = (value: number) =>
    translate('gallery.videoReview.resizeSeconds', locale).replace(
      '{value}',
      formatNumber(value / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, locale)
    );
  return (
    <span data-ui="gallery.videoReview.resizeDuration" className="block py-1 tabular-nums">
      <span className="block font-semibold">
        {translate('gallery.videoReview.resizeDuration', locale).replace(
          '{duration}',
          seconds(current)
        )}
      </span>
      <span className="block text-[var(--sniptale-color-text-secondary)]">
        {translate('gallery.videoReview.resizeBefore', locale).replace(
          '{duration}',
          seconds(initial)
        )}
        {' · '}
        {delta > 0 ? '+' : delta < 0 ? '−' : ''}
        {seconds(Math.abs(delta))}
      </span>
    </span>
  );
}
