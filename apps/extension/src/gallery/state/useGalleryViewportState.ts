import { useEffect, useRef, useState } from 'react';

function getViewportContentWidth(viewport: HTMLDivElement) {
  const computedStyle = window.getComputedStyle(viewport);
  const paddingLeft = Number.parseFloat(computedStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;

  return Math.max(0, viewport.clientWidth - paddingLeft - paddingRight);
}

export function useGalleryViewportState() {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(720);
  const [gridWidth, setGridWidth] = useState(1200);

  const gridViewportRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const viewport = gridViewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const updateMeasurements = () => {
      setGridWidth(getViewportContentWidth(viewport));
      setViewportHeight(viewport.clientHeight);
      setScrollTop(viewport.scrollTop);
    };

    updateMeasurements();
    const observer = new ResizeObserver(updateMeasurements);
    observer.observe(viewport);
    viewport.addEventListener('scroll', updateMeasurements, { passive: true });

    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', updateMeasurements);
    };
  }, []);

  return {
    gridViewportRef,
    gridWidth,
    importInputRef,
    scrollTop,
    viewportHeight,
  };
}
