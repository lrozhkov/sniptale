import React from 'react';
import { createScaledFrameAnnotationCoordinateSpace } from '../../features/highlighter/frame-annotation/coordinate-space';

export function useProjectionRect(elementRef: React.RefObject<HTMLElement | null>) {
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  React.useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(element.getBoundingClientRect()));
    };
    refresh();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    observer?.observe(element);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [elementRef]);
  return rect;
}

export function useEditorFrameCoordinateSpace(input: {
  canvasRect: DOMRect | null;
  scale: number;
  viewport: { width: number; height: number };
}) {
  const { canvasRect, scale, viewport } = input;
  return React.useMemo(
    () =>
      createScaledFrameAnnotationCoordinateSpace({
        origin: { x: canvasRect?.left ?? 0, y: canvasRect?.top ?? 0 },
        scale,
        viewport,
      }),
    [canvasRect?.left, canvasRect?.top, scale, viewport]
  );
}
