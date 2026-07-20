import type { BlurRuntimeObject } from '../../types';

export type MutableBlurCanvas = NonNullable<BlurRuntimeObject['canvas']> & {
  skipControlsDrawing: boolean;
};

type BackdropCaptureState = {
  enableRetinaScaling: MutableBlurCanvas['enableRetinaScaling'];
  height: MutableBlurCanvas['height'];
  skipControlsDrawing: MutableBlurCanvas['skipControlsDrawing'];
  viewportTransform: MutableBlurCanvas['viewportTransform'];
  width: MutableBlurCanvas['width'];
};

export function resolveBackdropCaptureState(canvas: MutableBlurCanvas): BackdropCaptureState {
  return {
    enableRetinaScaling: canvas.enableRetinaScaling,
    height: canvas.height,
    skipControlsDrawing: canvas.skipControlsDrawing,
    viewportTransform: [...canvas.viewportTransform] as typeof canvas.viewportTransform,
    width: canvas.width,
  };
}

export function restoreBackdropCaptureState(
  canvas: MutableBlurCanvas,
  previousState: BackdropCaptureState
): void {
  canvas.viewportTransform = previousState.viewportTransform;
  canvas.width = previousState.width;
  canvas.height = previousState.height;
  canvas.enableRetinaScaling = previousState.enableRetinaScaling;
  canvas.skipControlsDrawing = previousState.skipControlsDrawing;
  canvas.calcViewportBoundaries();
}
