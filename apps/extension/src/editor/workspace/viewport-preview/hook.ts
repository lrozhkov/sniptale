import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { ImageEditorController } from '../../controller';
import type { EditorViewportMetrics } from './types';
import { getPreviewSize, getViewportCenter, getViewportFrame } from './helpers';
import { startEditorViewportPreviewLoop } from './drawing';
import { navigateEditorViewportFromClientPoint } from './navigation';

interface UseEditorViewportPreviewArgs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  controller: Pick<ImageEditorController, 'navigateViewportTo' | 'canvas'>;
  hasImage: boolean;
  maxWidth?: number;
  viewport: EditorViewportMetrics;
  viewportPreviewOpen: boolean;
}

export function useEditorViewportPreview(args: UseEditorViewportPreviewArgs) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const dragPointerIdRef = useRef<number | null>(null);

  const previewSize = useMemo(
    () => getPreviewSize(args.viewport.canvasWidth, args.viewport.canvasHeight, args.maxWidth),
    [args.maxWidth, args.viewport.canvasHeight, args.viewport.canvasWidth]
  );

  const viewportCenter = useMemo(() => getViewportCenter(args.viewport), [args.viewport]);

  const viewportFrame = useMemo(
    () => getViewportFrame({ previewSize, viewport: args.viewport }),
    [args.viewport, previewSize]
  );

  useEffect(() => {
    if (!args.viewportPreviewOpen || !args.hasImage) {
      return undefined;
    }
    return startEditorViewportPreviewLoop({
      canvasRef: args.canvasRef,
      getCanvas: () => args.controller.canvas,
      previewCanvasRef,
      previewSize,
      documentSize: {
        width: args.viewport.canvasWidth,
        height: args.viewport.canvasHeight,
      },
    });
  }, [
    args.canvasRef,
    args.controller.canvas,
    args.hasImage,
    args.viewport.canvasWidth,
    args.viewport.canvasHeight,
    args.viewportPreviewOpen,
    previewSize,
  ]);

  const navigateFromClientPoint = (clientX: number, clientY: number) => {
    navigateEditorViewportFromClientPoint({
      clientX,
      clientY,
      controller: args.controller,
      previewSurfaceRef,
    });
  };

  return {
    dragPointerIdRef,
    navigateFromClientPoint,
    previewCanvasRef,
    previewSize,
    previewSurfaceRef,
    viewportCenter,
    viewportFrame,
  };
}
