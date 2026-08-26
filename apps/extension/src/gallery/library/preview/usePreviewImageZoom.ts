import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react';

const PREVIEW_IMAGE_FIT_HORIZONTAL_INSET = 32;
const PREVIEW_IMAGE_FIT_VERTICAL_INSET = 80;
const PREVIEW_IMAGE_SCALE_EPSILON = 0.001;
const PREVIEW_IMAGE_SCALE_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const PREVIEW_IMAGE_WHEEL_ZOOM_SENSITIVITY = 0.0025;

interface PreviewSize {
  height: number;
  width: number;
}

function calculatePreviewImageFitScale(
  naturalSize: PreviewSize | null,
  baseSize: PreviewSize | null
): number {
  if (!naturalSize || !baseSize || naturalSize.width <= 0 || naturalSize.height <= 0) return 1;
  return Math.min(baseSize.width / naturalSize.width, baseSize.height / naturalSize.height, 1);
}

function calculatePreviewImageMaximumScale(naturalSize: PreviewSize | null): number {
  if (!naturalSize || naturalSize.width <= 0 || naturalSize.height <= 0) return 4;
  const longSide = Math.max(naturalSize.width, naturalSize.height);

  if (longSide >= 8192) return 2;
  if (longSide >= 4096) return 3;
  if (longSide <= 1024) return 2;
  return 4;
}

interface PreviewViewportAnchor {
  localX: number;
  localY: number;
  ratioX: number;
  ratioY: number;
}

function capturePreviewViewportAnchor(
  container: HTMLDivElement,
  pointer?: { clientX: number; clientY: number }
): PreviewViewportAnchor {
  const rect = container.getBoundingClientRect();
  const localX = pointer ? pointer.clientX - rect.left : container.clientWidth / 2;
  const localY = pointer ? pointer.clientY - rect.top : container.clientHeight / 2;
  const scrollWidth = Math.max(container.clientWidth, container.scrollWidth, 1);
  const scrollHeight = Math.max(container.clientHeight, container.scrollHeight, 1);

  return {
    localX,
    localY,
    ratioX: (container.scrollLeft + localX) / scrollWidth,
    ratioY: (container.scrollTop + localY) / scrollHeight,
  };
}

function restorePreviewViewportAnchor(
  container: HTMLDivElement,
  anchor: PreviewViewportAnchor
): void {
  const scrollWidth = Math.max(container.clientWidth, container.scrollWidth, 1);
  const scrollHeight = Math.max(container.clientHeight, container.scrollHeight, 1);
  container.scrollLeft = Math.max(0, anchor.ratioX * scrollWidth - anchor.localX);
  container.scrollTop = Math.max(0, anchor.ratioY * scrollHeight - anchor.localY);
}

function normalizeWheelDelta(event: WheelEvent, pageHeight: number): number {
  const distance =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * pageHeight
        : event.deltaY;
  return Math.max(-240, Math.min(240, distance));
}

function usePreviewWheelZoom({
  containerRef,
  enabled,
  requestScale,
  scaleRef,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  requestScale: (nextScale: number, pointer?: { clientX: number; clientY: number }) => void;
  scaleRef: RefObject<number>;
}) {
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!enabled || (!event.ctrlKey && !event.metaKey) || event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      const container = containerRef.current;
      const delta = normalizeWheelDelta(event, container?.clientHeight ?? 0);
      requestScale(scaleRef.current * Math.exp(-delta * PREVIEW_IMAGE_WHEEL_ZOOM_SENSITIVITY), {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [containerRef, enabled, requestScale, scaleRef]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) {
      return undefined;
    }

    // React delegates wheel events through a passive root listener in Chromium. Canvas zoom owns
    // Ctrl/Cmd + wheel, so it needs one explicit non-passive listener to suppress page zoom safely.
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [containerRef, enabled, handleWheel]);
}

function findPreviewImageScaleStep(
  current: number,
  direction: -1 | 1,
  fitScale: number,
  maximumScale: number
): number {
  const steps = Array.from(
    new Set([
      fitScale,
      ...PREVIEW_IMAGE_SCALE_STEPS.filter((step) => step > fitScale && step < maximumScale),
      maximumScale,
    ])
  ).sort((left, right) => left - right);

  if (direction > 0) {
    return steps.find((step) => step > current + Math.max(0.05, current * 0.08)) ?? maximumScale;
  }

  return (
    [...steps].reverse().find((step) => step < current - PREVIEW_IMAGE_SCALE_EPSILON) ?? fitScale
  );
}

function calculatePreviewImageFitSize(natural: PreviewSize, container: PreviewSize) {
  if (natural.width <= 0 || natural.height <= 0 || container.width <= 0 || container.height <= 0) {
    return natural;
  }

  const availableWidth = Math.max(1, container.width - PREVIEW_IMAGE_FIT_HORIZONTAL_INSET);
  const availableHeight = Math.max(1, container.height - PREVIEW_IMAGE_FIT_VERTICAL_INSET);
  const ratio = Math.min(availableWidth / natural.width, availableHeight / natural.height, 1);
  return {
    width: Math.round(natural.width * ratio),
    height: Math.round(natural.height * ratio),
  };
}

function readContainerSize(container: HTMLDivElement | null): PreviewSize | null {
  if (!container) {
    return null;
  }

  return {
    width: container.clientWidth,
    height: container.clientHeight,
  };
}

function usePreviewImageBaseSize(
  enabled: boolean,
  resetKey: string | null,
  preparedNaturalSize: PreviewSize | null
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [baseSize, setBaseSize] = useState<PreviewSize | null>(null);
  const [naturalSize, setNaturalSize] = useState<PreviewSize | null>(null);

  const updateBaseSize = useCallback(() => {
    const containerSize = readContainerSize(containerRef.current);
    if (!naturalSize || !containerSize) {
      return;
    }

    setBaseSize(calculatePreviewImageFitSize(naturalSize, containerSize));
  }, [naturalSize]);

  useLayoutEffect(() => {
    const containerSize = readContainerSize(containerRef.current);
    setNaturalSize(preparedNaturalSize);
    setBaseSize(
      preparedNaturalSize && containerSize
        ? calculatePreviewImageFitSize(preparedNaturalSize, containerSize)
        : null
    );
  }, [enabled, preparedNaturalSize, resetKey]);

  useEffect(() => {
    if (!enabled || !containerRef.current) {
      return undefined;
    }

    updateBaseSize();
    const observer = new ResizeObserver(() => updateBaseSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [enabled, updateBaseSize]);

  useEffect(() => {
    updateBaseSize();
  }, [updateBaseSize]);

  const handleImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    setNaturalSize({
      width: event.currentTarget.naturalWidth || event.currentTarget.width,
      height: event.currentTarget.naturalHeight || event.currentTarget.height,
    });
  }, []);

  return { baseSize, containerRef, handleImageLoad, naturalSize, ready: baseSize !== null };
}

function usePreviewImagePan(input: {
  enabled: boolean;
  isZoomedFromFit: boolean;
  resetKey: string | null;
}) {
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ clientX: 0, clientY: 0, scrollLeft: 0, scrollTop: 0 });

  useEffect(() => setIsPanning(false), [input.enabled, input.resetKey]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!input.enabled || !input.isZoomedFromFit || event.button !== 0) {
        return;
      }

      const container = event.currentTarget;
      container.setPointerCapture(event.pointerId);
      panStartRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      };
      setIsPanning(true);
    },
    [input.enabled, input.isZoomedFromFit]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isPanning) return;

      const start = panStartRef.current;
      event.currentTarget.scrollLeft = start.scrollLeft - (event.clientX - start.clientX);
      event.currentTarget.scrollTop = start.scrollTop - (event.clientY - start.clientY);
    },
    [isPanning]
  );

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
  }, []);

  return { handlePointerDown, handlePointerEnd, handlePointerMove, isPanning };
}

export function usePreviewImageZoom(
  enabled: boolean,
  resetKey: string | null,
  preparedNaturalSize: PreviewSize | null = null
) {
  const { baseSize, containerRef, handleImageLoad, naturalSize, ready } = usePreviewImageBaseSize(
    enabled,
    resetKey,
    preparedNaturalSize
  );
  const [requestedScale, setRequestedScale] = useState<number | null>(null);
  const pendingViewportAnchorRef = useRef<PreviewViewportAnchor | null>(null);
  const fitScale = calculatePreviewImageFitScale(naturalSize, baseSize);
  const maximumScale = Math.max(fitScale, calculatePreviewImageMaximumScale(naturalSize));
  const scale = Math.min(maximumScale, Math.max(fitScale, requestedScale ?? fitScale));
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const zoomFromFit = fitScale > 0 ? scale / fitScale : 1;
  const isZoomedFromFit = zoomFromFit > 1 + PREVIEW_IMAGE_SCALE_EPSILON;
  const renderedSize = naturalSize
    ? { height: naturalSize.height * scale, width: naturalSize.width * scale }
    : baseSize
      ? { height: baseSize.height * zoomFromFit, width: baseSize.width * zoomFromFit }
      : null;

  useEffect(() => {
    setRequestedScale(null);
  }, [enabled, resetKey]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || baseSize === null) {
      return;
    }

    const pendingAnchor = pendingViewportAnchorRef.current;
    pendingViewportAnchorRef.current = null;
    if (pendingAnchor) {
      restorePreviewViewportAnchor(container, pendingAnchor);
      return;
    }

    container.scrollLeft = Math.max(0, (container.scrollWidth - container.clientWidth) / 2);
    container.scrollTop = Math.max(0, (container.scrollHeight - container.clientHeight) / 2);
  }, [baseSize, containerRef, zoomFromFit]);

  const requestScale = useCallback(
    (nextScale: number, pointer?: { clientX: number; clientY: number }) => {
      const normalizedScale = Math.min(maximumScale, Math.max(fitScale, nextScale));
      if (Math.abs(normalizedScale - scaleRef.current) <= PREVIEW_IMAGE_SCALE_EPSILON) {
        return;
      }

      const container = containerRef.current;
      pendingViewportAnchorRef.current = container
        ? capturePreviewViewportAnchor(container, pointer)
        : null;
      setRequestedScale(
        Math.abs(normalizedScale - fitScale) <= PREVIEW_IMAGE_SCALE_EPSILON ? null : normalizedScale
      );
      scaleRef.current = normalizedScale;
    },
    [containerRef, fitScale, maximumScale]
  );

  const updateZoom = useCallback(
    (direction: -1 | 1) => {
      requestScale(findPreviewImageScaleStep(scaleRef.current, direction, fitScale, maximumScale));
    },
    [fitScale, maximumScale, requestScale]
  );

  usePreviewWheelZoom({ containerRef, enabled, requestScale, scaleRef });
  const imagePan = usePreviewImagePan({ enabled, isZoomedFromFit, resetKey });

  return {
    controls: {
      canZoomIn: scale < maximumScale - PREVIEW_IMAGE_SCALE_EPSILON,
      canZoomOut: isZoomedFromFit,
      isZoomedFromFit,
      resetZoom: () => requestScale(fitScale),
      zoom: scale,
      zoomIn: () => updateZoom(1),
      zoomOut: () => updateZoom(-1),
    },
    image: {
      handleImageLoad,
      ready,
      style:
        renderedSize === null
          ? undefined
          : {
              height: `${Math.round(renderedSize.height)}px`,
              width: `${Math.round(renderedSize.width)}px`,
            },
    },
    viewport: {
      containerRef,
      ...imagePan,
    },
  };
}
