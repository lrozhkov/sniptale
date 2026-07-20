import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import type { BlurRuntimeObject } from '../types';
import { resolveBlurAreaBounds } from '../geometry';

export type BlurBackdropBounds = {
  height: number;
  left: number;
  paddedHeight: number;
  paddedWidth: number;
  top: number;
  width: number;
};

export function resolveBlurBounds(object: BlurRuntimeObject, padding: number): BlurBackdropBounds {
  const areaBounds = resolveBlurAreaBounds(object);
  const width = areaBounds.width;
  const height = areaBounds.height;
  const left = Math.round(areaBounds.left - padding);
  const top = Math.round(areaBounds.top - padding);

  return {
    height,
    left,
    paddedHeight: height + padding * 2,
    paddedWidth: width + padding * 2,
    top,
    width,
  };
}

export function resolveBackdropPadding(settings: BlurSettings): number {
  switch (settings.blurType) {
    case 'gaussian':
      return Math.max(2, Math.ceil(settings.amount * 3));
    case 'distortion':
      return Math.max(2, Math.ceil(settings.amount * 1.5));
    case 'pixelate':
    case 'solid':
      return 0;
  }
}
