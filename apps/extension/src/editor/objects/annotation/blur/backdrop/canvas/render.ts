import { getEditorEditingDocumentSize } from '../../../../../document/canvas-surface/editing-surface';
import type { BlurBackdropBounds } from '../bounds';
import { extendBackdropCanvasEdges, extendTransformedBackdropCanvasEdges } from './edges';
import {
  resolveBackdropCaptureState,
  restoreBackdropCaptureState,
  type MutableBlurCanvas,
} from './state';

const activeSceneDimensions = new WeakMap<MutableBlurCanvas, { height: number; width: number }>();

export function renderBackdropCanvas(options: {
  backdropCanvas: HTMLCanvasElement;
  bounds: BlurBackdropBounds;
  canvas: MutableBlurCanvas;
  context: CanvasRenderingContext2D;
  objectIndex: number;
}): void {
  const previousState = resolveBackdropCaptureState(options.canvas);
  const outerSceneDimensions = activeSceneDimensions.get(options.canvas);
  const sceneDimensions = outerSceneDimensions ??
    getEditorEditingDocumentSize(options.canvas) ?? {
      height: previousState.height,
      width: previousState.width,
    };
  if (!outerSceneDimensions) {
    activeSceneDimensions.set(options.canvas, sceneDimensions);
  }
  try {
    const viewportTransform = options.bounds.viewportTransform ?? [
      1,
      0,
      0,
      1,
      -options.bounds.left,
      -options.bounds.top,
    ];
    options.canvas.viewportTransform = viewportTransform;
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
      const [scaleX, skewY, skewX, scaleY, offsetX, offsetY] = viewportTransform;
      if (scaleX > 0 && scaleY > 0 && skewX === 0 && skewY === 0) {
        extendBackdropCanvasEdges({
          backdropCanvas: options.backdropCanvas,
          bounds: { ...options.bounds, left: -offsetX, top: -offsetY },
          context: options.context,
          sceneHeight: sceneDimensions.height * scaleY,
          sceneWidth: sceneDimensions.width * scaleX,
        });
      } else {
        extendTransformedBackdropCanvasEdges({
          backdropCanvas: options.backdropCanvas,
          context: options.context,
          sceneHeight: sceneDimensions.height,
          sceneWidth: sceneDimensions.width,
          viewportTransform,
        });
      }
    }
  } finally {
    try {
      restoreBackdropCaptureState(options.canvas, previousState);
    } finally {
      if (!outerSceneDimensions) {
        activeSceneDimensions.delete(options.canvas);
      }
    }
  }
}
