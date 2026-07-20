import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import type { BlurRuntimeObject } from '../types';

import { resolveBackdropPadding, resolveBlurBounds } from './bounds';
import { renderBackdropCanvas, type MutableBlurCanvas } from './canvas';

export function captureBlurBackdrop(
  object: BlurRuntimeObject,
  settings: BlurSettings
): {
  canvas: HTMLCanvasElement;
  height: number;
  padding: number;
  width: number;
} | null {
  const canvas = object.canvas as MutableBlurCanvas | undefined;
  if (!canvas) {
    return null;
  }

  const allObjects = canvas.getObjects();
  const objectIndex = allObjects.indexOf(object);
  if (objectIndex === -1) {
    return null;
  }

  const padding = resolveBackdropPadding(settings);
  const bounds = resolveBlurBounds(object, padding);
  const backdropCanvas = document.createElement('canvas');
  backdropCanvas.width = bounds.paddedWidth;
  backdropCanvas.height = bounds.paddedHeight;
  const context = backdropCanvas.getContext('2d');
  if (!context) {
    return null;
  }

  renderBackdropCanvas({ backdropCanvas, bounds, canvas, context, objectIndex });

  return {
    canvas: backdropCanvas,
    height: bounds.height,
    padding,
    width: bounds.width,
  };
}
