import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createTimelineProjection, timelineScrollLeftToTime } from './projection';

/** Owns precise view time and the native scrollbar acknowledgement lifecycle. */
export function useTimelineNavigation(params: {
  extentSeconds: number;
  pixelsPerSecond: number;
  viewportWidth: number;
  timelineRef: RefObject<HTMLDivElement | null>;
}) {
  const [startTime, setStartTime] = useState(0);
  const projection = createTimelineProjection({ ...params, startTime });
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  const acknowledgedScroll = useRef(0);
  const { timelineRef } = params;
  const readStartTime = useCallback(() => {
    const node = timelineRef.current;
    const view = projectionRef.current;
    return node && node.scrollLeft !== acknowledgedScroll.current
      ? timelineScrollLeftToTime(view, node.scrollLeft)
      : view.startTime;
  }, [timelineRef]);
  const navigateTo = useCallback(
    (time: number) => {
      const view = projectionRef.current;
      const next = Math.min(view.maxStartTime, Math.max(0, time));
      const scrollLeft =
        view.maxStartTime > 0
          ? (next / view.maxStartTime) * (view.scrollWidth - view.viewportWidth)
          : 0;
      projectionRef.current = {
        ...view,
        startTime: next,
        scrollLeft,
        endTime: next + view.viewportWidth / view.pixelsPerSecond,
      };
      const node = timelineRef.current;
      if (node) {
        node.scrollLeft = scrollLeft;
        acknowledgedScroll.current = node.scrollLeft;
      }
      setStartTime(next);
    },
    [timelineRef]
  );
  useLayoutEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    node.scrollLeft = projection.scrollLeft;
    // A DOM acknowledgement is rounded; retain precise time until actual user navigation.
    acknowledgedScroll.current = node.scrollLeft;
  }, [projection.scrollLeft, timelineRef]);
  useLayoutEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    const onScroll = () => {
      if (node.scrollLeft === acknowledgedScroll.current) return;
      const next = timelineScrollLeftToTime(projectionRef.current, node.scrollLeft);
      acknowledgedScroll.current = node.scrollLeft;
      navigateTo(next);
    };
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      const view = projectionRef.current;
      const horizontalOnly = node.scrollHeight <= node.clientHeight && view.maxStartTime > 0;
      const delta = event.deltaX || (event.shiftKey || horizontalOnly ? event.deltaY : 0);
      if (!delta) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.viewportWidth : 1;
      if (event.deltaX && !event.shiftKey) node.scrollTop += event.deltaY * unit;
      navigateTo(readStartTime() + (delta * unit) / view.pixelsPerSecond);
    };
    node.addEventListener('scroll', onScroll);
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('scroll', onScroll);
      node.removeEventListener('wheel', onWheel);
    };
  }, [navigateTo, readStartTime, timelineRef]);
  return { projection, navigateTo, readStartTime };
}
