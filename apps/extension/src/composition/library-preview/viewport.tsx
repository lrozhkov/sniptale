import { useViewportPanGesture } from '@sniptale/ui/viewport-pan';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from 'react';
function captureImageAnchor(node: HTMLDivElement | null, pointer?: { x: number; y: number }) {
  const picture = node?.querySelector('img')?.getBoundingClientRect();
  if (!node || !picture?.width || !picture.height) return null;
  const frame = node.getBoundingClientRect();
  const x = pointer ? pointer.x - frame.left : node.clientWidth / 2;
  const y = pointer ? pointer.y - frame.top : node.clientHeight / 2;
  return {
    x,
    y,
    ratioX: (frame.left + x - picture.left) / picture.width,
    ratioY: (frame.top + y - picture.top) / picture.height,
  };
}

/** Owns viewport zoom, panning, fullscreen and focus restoration independently of media transport. */
export function useLibraryViewport(src: string | null, setFailed: (failed: boolean) => void) {
  const viewport = useRef<HTMLDivElement>(null);
  const previousScale = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [imageScale, setImageScale] = useState<number | null>(null);
  const [natural, setNatural] = useState<{
    src: string | null;
    width: number;
    height: number;
  } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const image = natural?.src === src ? natural : null;
  const fitScale =
    image && size.width > 0 && size.height > 0
      ? Math.min(size.width / image.width, size.height / image.height, 1)
      : 1;
  const maximumZoom = image ? Math.max(1, 4 / fitScale) : 2;
  const currentZoom = image
    ? Math.min(maximumZoom, Math.max(1, (imageScale ?? fitScale) / fitScale))
    : zoom;
  const scale = image ? fitScale * currentZoom : currentZoom;
  const pan = useLibraryPreviewPan(viewport, currentZoom > 1);
  const fullscreenState = useLibraryFullscreen(setFailed);
  const imageAnchor = useRef<ReturnType<typeof captureImageAnchor>>(null);
  useLayoutEffect(() => {
    const node = viewport.current;
    const anchor = imageAnchor.current;
    const picture = node?.querySelector('img')?.getBoundingClientRect();
    if (node && anchor && picture) {
      // Centered fit margins are not image pixels and must not be multiplied by zoom.
      node.scrollLeft =
        anchor.ratioX * picture.width +
        Math.max(0, (node.clientWidth - picture.width) / 2) -
        anchor.x;
      node.scrollTop =
        anchor.ratioY * picture.height +
        Math.max(0, (node.clientHeight - picture.height) / 2) -
        anchor.y;
    } else if (node && !picture) {
      const ratio = scale / previousScale.current;
      node.scrollLeft = (node.scrollLeft + node.clientWidth / 2) * ratio - node.clientWidth / 2;
      node.scrollTop = (node.scrollTop + node.clientHeight / 2) * ratio - node.clientHeight / 2;
    }
    imageAnchor.current = null;
    previousScale.current = scale;
  }, [scale]);
  useEffect(() => {
    setZoom(1);
    setImageScale(null);
    previousScale.current = 1;
    imageAnchor.current = null;
    if (viewport.current) {
      viewport.current.scrollLeft = 0;
      viewport.current.scrollTop = 0;
    }
  }, [src]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (!node || !image) return;
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !event.deltaY) return;
      event.preventDefault();
      imageAnchor.current = captureImageAnchor(node, { x: event.clientX, y: event.clientY });
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      setImageScale((value) =>
        Math.min(4, Math.max(fitScale, (value ?? fitScale) * Math.exp(-delta * 0.0025)))
      );
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [image, fitScale]);
  return {
    viewport,
    zoom: currentZoom,
    setZoom: (value: number) => {
      if (image) {
        imageAnchor.current = captureImageAnchor(viewport.current);
        setImageScale(value === 1 ? null : value * fitScale);
      } else setZoom(value);
    },
    pan,
    ...fullscreenState,
    fitScale,
    imageSize: image
      ? {
          width: image.width * fitScale * currentZoom,
          height: image.height * fitScale * currentZoom,
        }
      : null,
    onImageLoad: (node: HTMLImageElement) => {
      if (node.naturalWidth > 0 && node.naturalHeight > 0)
        setNatural({ src, width: node.naturalWidth, height: node.naturalHeight });
    },
  };
}
export function useLibraryFullscreen(setFailed: (failed: boolean) => void) {
  const frame = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const previousFullscreen = useRef(false);
  const handoff = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  useLayoutEffect(() => {
    if (previousFullscreen.current !== fullscreen) {
      if (!handoff.current) fullscreenButton.current?.focus({ preventScroll: true });
      if (!fullscreen) handoff.current = false;
      previousFullscreen.current = fullscreen;
    }
  }, [fullscreen]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const exit = async (restoreFocus: boolean): Promise<boolean> => {
    handoff.current = !restoreFocus;
    try {
      if (document.fullscreenElement) {
        if (!document.exitFullscreen) throw new Error('Fullscreen exit unavailable');
        await document.exitFullscreen();
      }
      if (document.fullscreenElement === frame.current && frame.current) {
        throw new Error('Fullscreen exit incomplete');
      }
      return true;
    } catch {
      handoff.current = false;
      setFailed(true);
      return false;
    }
  };
  return {
    frame,
    fullscreen,
    fullscreenButton,
    enterFullscreen: () => {
      void frame.current?.requestFullscreen?.().catch(() => setFailed(true));
    },
    exitFullscreen: () => exit(true),
    exitFullscreenForHandoff: () => exit(false),
  };
}

function useLibraryPreviewPan(viewport: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const { dragging, finish, start, move, end } = useViewportPanGesture(viewport);
  useEffect(() => {
    if (!enabled) finish();
    return finish;
  }, [enabled, finish]);
  return {
    dragging,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (enabled) start(event);
      },
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
    },
  };
}
