import React, { useEffect, useRef } from 'react';
import { useOptionalEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';

function syncOverlayCanvasDimensions(
  sourceCanvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement
): CanvasRenderingContext2D | null {
  const width = sourceCanvas.clientWidth;
  const height = sourceCanvas.clientHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  overlayCanvas.width = Math.max(1, Math.round(width * pixelRatio));
  overlayCanvas.height = Math.max(1, Math.round(height * pixelRatio));
  overlayCanvas.style.width = `${width}px`;
  overlayCanvas.style.height = `${height}px`;
  const context = overlayCanvas.getContext('2d');
  if (!context) {
    return null;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return context;
}

function createRasterOverlayDraw(
  controller: ReturnType<typeof useOptionalEditorController>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  overlayRef: React.RefObject<HTMLCanvasElement | null>
) {
  return () => {
    const sourceCanvas = canvasRef.current;
    const overlayCanvas = overlayRef.current;
    if (!controller || !sourceCanvas || !overlayCanvas) {
      return;
    }

    const context = syncOverlayCanvasDimensions(sourceCanvas, overlayCanvas);
    if (!context) {
      return;
    }

    controller.renderRasterOverlay(context, {
      width: sourceCanvas.clientWidth,
      height: sourceCanvas.clientHeight,
    });
  };
}

function observeOverlaySource(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  draw: () => void
) {
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
  if (observer && canvasRef.current) {
    observer.observe(canvasRef.current);
  }
  return observer;
}

function useRasterOverlaySubscription(args: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  controller: ReturnType<typeof useOptionalEditorController>;
  hasImage: boolean;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  rasterSelection: ReturnType<typeof useEditorStore.getState>['rasterSelection'];
  viewport: ReturnType<typeof useEditorStore.getState>['viewport'];
  activeTool: ReturnType<typeof useEditorStore.getState>['activeTool'];
}) {
  useEffect(() => {
    if (!args.hasImage || !args.controller) {
      return;
    }

    const draw = createRasterOverlayDraw(args.controller, args.canvasRef, args.overlayRef);
    draw();
    const unsubscribe =
      typeof args.controller.subscribeRasterOverlay === 'function'
        ? args.controller.subscribeRasterOverlay(draw)
        : () => undefined;
    const observer = observeOverlaySource(args.canvasRef, draw);

    return () => {
      unsubscribe();
      observer?.disconnect();
    };
  }, [
    args.activeTool,
    args.canvasRef,
    args.controller,
    args.hasImage,
    args.overlayRef,
    args.rasterSelection,
    args.viewport.canvasHeight,
    args.viewport.canvasWidth,
    args.viewport.canvasOffsetLeft,
    args.viewport.canvasOffsetTop,
    args.viewport.scaledCanvasHeight,
    args.viewport.scaledCanvasWidth,
    args.viewport.scrollLeft,
    args.viewport.scrollTop,
    args.viewport.zoomPercent,
  ]);
}

export function EditorRasterOverlay(props: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  hasImage: boolean;
}) {
  const controller = useOptionalEditorController();
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const viewport = useEditorStore((state) => state.viewport);
  const activeTool = useEditorStore((state) => state.activeTool);
  const rasterSelection = useEditorStore((state) => state.rasterSelection);

  useRasterOverlaySubscription({
    activeTool,
    canvasRef: props.canvasRef,
    controller,
    hasImage: props.hasImage,
    overlayRef,
    rasterSelection,
    viewport,
  });

  return props.hasImage ? (
    <canvas
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 block"
      data-ui="editor.canvas.raster-overlay"
    />
  ) : null;
}
