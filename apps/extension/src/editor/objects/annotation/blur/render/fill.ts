import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import { captureBlurBackdrop } from '../backdrop/capture';
import {
  drawDistortedBackdrop,
  drawGaussianBackdrop,
  drawPixelatedBackdrop,
  drawSolidBlur,
} from '../effects';
import type { BlurRuntimeObject } from '../types';
import { resolveBlurRenderArea } from './area';

export function renderBlurFill(
  object: BlurRuntimeObject,
  ctx: CanvasRenderingContext2D,
  settings: BlurSettings
): void {
  const { width, height } = resolveBlurRenderArea(object, settings);
  if (settings.blurType === 'solid') {
    drawSolidBlur(ctx, width, height, settings);
    return;
  }

  const backdrop = captureBlurBackdrop(object, settings);
  if (!backdrop) {
    return;
  }

  switch (settings.blurType) {
    case 'gaussian':
      drawGaussianBackdrop(ctx, backdrop.canvas, width, height, backdrop.padding, settings.amount);
      break;
    case 'distortion':
      drawDistortedBackdrop(ctx, backdrop.canvas, width, height, backdrop.padding, settings.amount);
      break;
    case 'pixelate':
      drawPixelatedBackdrop(ctx, backdrop.canvas, width, height, backdrop.padding, settings.amount);
      break;
  }
}
