import { util, type TMat2D } from 'fabric';
import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import type { BlurRuntimeObject } from '../types';
import { resolveBlurAreaBounds } from '../geometry';

export type BlurBackdropBounds = {
  height: number;
  left: number;
  paddedHeight: number;
  paddedWidth: number;
  top: number;
  viewportTransform?: TMat2D;
  width: number;
};

export function resolveBlurBounds(object: BlurRuntimeObject, padding: number): BlurBackdropBounds {
  const areaBounds = resolveBlurAreaBounds(object);
  const width = areaBounds.width;
  const height = areaBounds.height;
  const left = Math.round(areaBounds.left - padding);
  const top = Math.round(areaBounds.top - padding);
  const localToScene =
    typeof object.calcTransformMatrix === 'function'
      ? object.calcTransformMatrix()
      : ([1, 0, 0, 1, areaBounds.left + width / 2, areaBounds.top + height / 2] as TMat2D);
  const determinant = localToScene[0] * localToScene[3] - localToScene[1] * localToScene[2];
  const hasVisibleAxes =
    Math.hypot(localToScene[0], localToScene[1]) >= 1e-3 &&
    Math.hypot(localToScene[2], localToScene[3]) >= 1e-3;
  const viewportTransform: TMat2D =
    hasVisibleAxes && Number.isFinite(determinant) && Math.abs(determinant) > 1e-8
      ? util.multiplyTransformMatrices(
          [1, 0, 0, 1, width / 2 + padding, height / 2 + padding],
          util.invertTransform(localToScene)
        )
      : [1, 0, 0, 1, -left, -top];

  return {
    height,
    left,
    paddedHeight: height + padding * 2,
    paddedWidth: width + padding * 2,
    top,
    viewportTransform,
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
