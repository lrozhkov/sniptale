import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { useDesignReviewPointerDrag } from '../pointer-drag';

const VIEWPORT_GAP = 12;
const DEFAULT_HEIGHT = 420;
const MIN_HEIGHT = 180;
const KEYBOARD_STEP = 16;

/** Local panel height. Cancellation restores the height from before the gesture. */
export function useFeedbackPanelResize(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  uiScale = 1
) {
  const [resized, setResized] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [ariaHeight, setAriaHeight] = useState(DEFAULT_HEIGHT);
  const [maxHeight, setMaxHeight] = useState(DEFAULT_HEIGHT);
  const heightRef = useRef(height);
  const gestureRef = useRef<{
    pointerId: number;
    origin: number;
    resized: boolean;
  } | null>(null);
  const availableHeight = useCallback(
    () =>
      Math.max(
        0,
        (window.innerHeight - (panelRef.current?.getBoundingClientRect().top ?? 0)) / uiScale -
          VIEWPORT_GAP
      ),
    [panelRef, uiScale]
  );
  const updateHeight = useCallback(
    (next: number) => {
      const maximum = availableHeight();
      const bounded = Math.min(maximum, Math.max(Math.min(MIN_HEIGHT, maximum), next));
      heightRef.current = bounded;
      setHeight(bounded);
      setMaxHeight(maximum);
    },
    [availableHeight]
  );
  const drag = useDesignReviewPointerDrag({
    position: height,
    uiScale,
    move: (_origin, _deltaX, deltaY) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      setResized(true);
      updateHeight(gesture.origin + deltaY);
    },
  });
  const cancelDrag = drag.cancelPointerDrag;
  const cancelResize = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    cancelDrag();
    if (!gesture) return;
    setResized(gesture.resized);
    updateHeight(gesture.origin);
  }, [cancelDrag, updateHeight]);
  useLayoutEffect(() => {
    if (!open) return;
    updateHeight(heightRef.current);
    setAriaHeight(panelRef.current?.offsetHeight || heightRef.current);
  }, [open, panelRef, height, resized, updateHeight]);
  useLayoutEffect(() => {
    if (!open) {
      cancelResize();
      return;
    }
    const measure = () => {
      updateHeight(heightRef.current);
      setAriaHeight(panelRef.current?.offsetHeight || heightRef.current);
    };
    const panel = panelRef.current;
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const placementObserver = new MutationObserver(measure);
    if (panel) {
      resizeObserver?.observe(panel);
      placementObserver.observe(panel, { attributes: true, attributeFilter: ['style'] });
    }
    window.addEventListener('resize', measure);
    return () => {
      resizeObserver?.disconnect();
      placementObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, panelRef, cancelResize, updateHeight]);
  return {
    height,
    ariaHeight,
    resized,
    minHeight: Math.min(MIN_HEIGHT, maxHeight),
    maxHeight,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || gestureRef.current) return;
      drag.onPointerDown(event);
      gestureRef.current = {
        pointerId: event.pointerId,
        origin: panelRef.current?.offsetHeight || heightRef.current,
        resized,
      };
    },
    onPointerMove: drag.onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      drag.onPointerUp(event);
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId === event.pointerId) cancelResize();
    },
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      if (gestureRef.current?.pointerId === event.pointerId) cancelResize();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const currentHeight = resized
        ? heightRef.current
        : panelRef.current?.offsetHeight || heightRef.current;
      const next =
        event.key === 'ArrowUp'
          ? currentHeight - KEYBOARD_STEP
          : event.key === 'ArrowDown'
            ? currentHeight + KEYBOARD_STEP
            : event.key === 'Home'
              ? MIN_HEIGHT
              : event.key === 'End'
                ? availableHeight()
                : null;
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      setResized(true);
      updateHeight(next);
    },
  };
}
