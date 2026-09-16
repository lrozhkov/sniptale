import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from 'react';
/** Owns viewport zoom, panning, fullscreen and focus restoration independently of media transport. */
export function useLibraryViewport(src: string | null, setFailed: (failed: boolean) => void) {
  const viewport = useRef<HTMLDivElement>(null);
  const previousZoom = useRef(1);
  const [zoom, setZoom] = useState(1);
  const pan = useLibraryPreviewPan(viewport, zoom > 1);
  const fullscreenState = useLibraryFullscreen(setFailed);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node) {
      const ratio = zoom / previousZoom.current;
      node.scrollLeft = (node.scrollLeft + node.clientWidth / 2) * ratio - node.clientWidth / 2;
      node.scrollTop = (node.scrollTop + node.clientHeight / 2) * ratio - node.clientHeight / 2;
    }
    previousZoom.current = zoom;
  }, [zoom]);
  useEffect(() => {
    setZoom(1);
    previousZoom.current = 1;
    if (viewport.current) {
      viewport.current.scrollLeft = 0;
      viewport.current.scrollTop = 0;
    }
  }, [src]);
  return { viewport, zoom, setZoom, pan, ...fullscreenState };
}
function useLibraryFullscreen(setFailed: (failed: boolean) => void) {
  const frame = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const previousFullscreen = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  useLayoutEffect(() => {
    if (previousFullscreen.current !== fullscreen) {
      fullscreenButton.current?.focus({ preventScroll: true });
      previousFullscreen.current = fullscreen;
    }
  }, [fullscreen]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  return {
    frame,
    fullscreen,
    fullscreenButton,
    enterFullscreen: () => {
      void frame.current?.requestFullscreen?.().catch(() => setFailed(true));
    },
    exitFullscreen: () => {
      void document.exitFullscreen?.().catch(() => setFailed(true));
    },
  };
}

function useLibraryPreviewPan(viewport: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const gesture = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const finish = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (active && viewport.current?.hasPointerCapture(active.id)) {
      viewport.current.releasePointerCapture(active.id);
    }
  }, [viewport]);
  useEffect(() => {
    if (!enabled) finish();
    return finish;
  }, [enabled, finish]);
  return {
    dragging,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (!enabled || event.button !== 0 || gesture.current) return;
        event.preventDefault();
        const node = event.currentTarget;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: node.scrollLeft,
          top: node.scrollTop,
        };
        node.setPointerCapture(event.pointerId);
        setDragging(true);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        event.currentTarget.scrollLeft = active.left + active.x - event.clientX;
        event.currentTarget.scrollTop = active.top + active.y - event.clientY;
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id === event.pointerId) finish();
      },
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id === event.pointerId) finish();
      },
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id === event.pointerId) finish();
      },
    },
  };
}
