import { useEffect, useRef, useState } from 'react';

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
