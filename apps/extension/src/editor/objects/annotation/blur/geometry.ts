import type { BlurRuntimeObject } from './types';

export type BlurRectBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
};

function normalizeDimension(value: number): number {
  return Math.max(1, Math.round(value));
}

export function normalizeBlurBounds(bounds: BlurRectBounds): BlurRectBounds {
  return {
    height: normalizeDimension(bounds.height),
    left: bounds.left,
    top: bounds.top,
    width: normalizeDimension(bounds.width),
  };
}

export function expandBlurAreaBounds(areaBounds: BlurRectBounds): BlurRectBounds {
  return normalizeBlurBounds(areaBounds);
}

export function resolveBlurAreaBounds(object: BlurRuntimeObject): BlurRectBounds {
  return normalizeBlurBounds({
    height: Math.max(1, object.height ?? 1),
    left: object.left ?? 0,
    top: object.top ?? 0,
    width: Math.max(1, object.width ?? 1),
  });
}
