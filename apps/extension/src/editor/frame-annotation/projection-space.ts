import React from 'react';
import type { Canvas } from 'fabric';
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
  canvasRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | null;
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

/** Coalesces native annotation transforms without subscribing to the render loop. */
export function useFrameAnnotationCanvasUpdates(canvas: Canvas | null, refresh: () => void): void {
  React.useEffect(() => {
    if (!canvas) return;
    let frame: number | null = null;
    const schedule = () => {
      if (
        frame !== null ||
        !canvas.getActiveObjects().some((object) => object.sniptaleType === 'frame-annotation')
      )
        return;
      frame = requestAnimationFrame(() => {
        frame = null;
        refresh();
      });
    };
    const subscriptions = [
      canvas.on('object:moving', schedule),
      canvas.on('object:scaling', schedule),
      canvas.on('object:modified', schedule),
    ];
    return () => {
      subscriptions.forEach((dispose) => dispose());
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [canvas, refresh]);
}
