import { useLayoutEffect, useRef, useState } from 'react';

/** Disposable visible source window; scrolling changes detail without retaining PCM. */
export function useWaveformViewport(position = 0) {
  const ref = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 640, start: 0, end: 1 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const scroller = node.closest('[data-ui="gallery.videoReview.timelineViewport"]');
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      if (bounds.width <= 0) return;
      const frame = scroller?.getBoundingClientRect() ?? bounds;
      const start = Math.max(0, Math.min(1, (frame.left - bounds.left) / bounds.width));
      const end = Math.max(start, Math.min(1, (frame.right - bounds.left) / bounds.width));
      const next = { width: Math.ceil(bounds.width), start, end };
      setViewport((current) =>
        current.width === next.width && current.start === start && current.end === end
          ? current
          : next
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    if (scroller) observer?.observe(scroller);
    scroller?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      scroller?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [position]);
  return { ref, ...viewport };
}
