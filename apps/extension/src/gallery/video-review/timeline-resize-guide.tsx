import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import { ReviewTimelineHoverGuide } from './timeline-hover';

type Boundary = { gesture: object; time: number };
type PublishBoundary = (gesture: object, time: number | null) => void;
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
  const publish = useCallback<PublishBoundary>((gesture, time) => {
    setBoundary((current) =>
      time === null
        ? current?.gesture === gesture
          ? null
          : current
        : current?.gesture === gesture && current.time === time
          ? current
          : { gesture, time }
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
export function useReviewResizeBoundary(gesture: object | null, time: number | null) {
  const publish = useContext(BoundaryContext);
  useLayoutEffect(() => {
    if (!gesture || time === null) return;
    publish(gesture, time);
    return () => publish(gesture, null);
  }, [gesture, time, publish]);
}
