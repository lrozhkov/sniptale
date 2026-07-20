import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';

const PREVIEW_IMAGE_ZOOM_MIN = 0.5;
const PREVIEW_IMAGE_ZOOM_MAX = 4;
const PREVIEW_IMAGE_ZOOM_STEP = 0.25;

interface PreviewSize {
  height: number;
  width: number;
}

function clampPreviewImageZoom(value: number) {
  return Math.min(PREVIEW_IMAGE_ZOOM_MAX, Math.max(PREVIEW_IMAGE_ZOOM_MIN, value));
}

function calculatePreviewImageFitSize(natural: PreviewSize, container: PreviewSize) {
  if (natural.width <= 0 || natural.height <= 0 || container.width <= 0 || container.height <= 0) {
    return natural;
  }

  const ratio = Math.min(container.width / natural.width, container.height / natural.height, 1);
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

function usePreviewImageBaseSize(enabled: boolean, resetKey: string | null) {
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

  useEffect(() => {
    setBaseSize(null);
    setNaturalSize(null);
  }, [enabled, resetKey]);

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

  return { baseSize, containerRef, handleImageLoad };
}

export function usePreviewImageZoom(enabled: boolean, resetKey: string | null) {
  const { baseSize, containerRef, handleImageLoad } = usePreviewImageBaseSize(enabled, resetKey);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [enabled, resetKey]);

  const updateZoom = useCallback((delta: number) => {
    setZoom((current) => clampPreviewImageZoom(current + delta));
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!enabled) {
        return;
      }

      event.preventDefault();
      updateZoom(event.deltaY < 0 ? PREVIEW_IMAGE_ZOOM_STEP : -PREVIEW_IMAGE_ZOOM_STEP);
    },
    [enabled, updateZoom]
  );

  return {
    containerRef,
    handleImageLoad,
    handleWheel,
    imageStyle:
      baseSize === null
        ? undefined
        : {
            height: `${Math.round(baseSize.height * zoom)}px`,
            width: `${Math.round(baseSize.width * zoom)}px`,
          },
    resetZoom: () => setZoom(1),
    zoom,
    zoomIn: () => updateZoom(PREVIEW_IMAGE_ZOOM_STEP),
    zoomOut: () => updateZoom(-PREVIEW_IMAGE_ZOOM_STEP),
  };
}
