import type { BlurBackdropBounds } from '../bounds';
import { extendBackdropCanvasEdges } from './edges';
import {
  resolveBackdropCaptureState,
  restoreBackdropCaptureState,
  type MutableBlurCanvas,
} from './state';

export function renderBackdropCanvas(options: {
  backdropCanvas: HTMLCanvasElement;
  bounds: BlurBackdropBounds;
  canvas: MutableBlurCanvas;
  context: CanvasRenderingContext2D;
  objectIndex: number;
}): void {
  const previousState = resolveBackdropCaptureState(options.canvas);
  options.canvas.viewportTransform = [1, 0, 0, 1, -options.bounds.left, -options.bounds.top];
  options.canvas.width = options.bounds.paddedWidth;
  options.canvas.height = options.bounds.paddedHeight;
  options.canvas.enableRetinaScaling = false;
  options.canvas.skipControlsDrawing = true;
  options.canvas.calcViewportBoundaries();
  options.canvas.renderCanvas(
    options.context,
    options.canvas
      .getObjects()
      .slice(0, options.objectIndex)
      .filter((entry) => entry.visible !== false)
  );
  if (
    options.bounds.paddedWidth > options.bounds.width ||
    options.bounds.paddedHeight > options.bounds.height
  ) {
    extendBackdropCanvasEdges({
      backdropCanvas: options.backdropCanvas,
      bounds: options.bounds,
      context: options.context,
      sceneHeight: previousState.height,
      sceneWidth: previousState.width,
    });
  }
  restoreBackdropCaptureState(options.canvas, previousState);
}
