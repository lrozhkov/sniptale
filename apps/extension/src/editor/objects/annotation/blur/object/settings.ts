import type { FabricObject } from 'fabric';
import type { BlurSettings } from '../../../../../features/highlighter/contracts';
import { DEFAULT_BLUR_SETTINGS } from '../../../../../features/highlighter/style/defaults';
import { getBlurBorderSettings } from '../border';

function resolveBlurAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_BLUR_SETTINGS.amount;
}

function resolveBlurType(value: unknown): BlurSettings['blurType'] {
  return value === 'distortion' || value === 'solid' || value === 'gaussian' || value === 'pixelate'
    ? value
    : DEFAULT_BLUR_SETTINGS.blurType;
}

export function getBlurSettings(object: FabricObject): BlurSettings {
  return {
    amount: resolveBlurAmount(object.sniptaleBlurAmount),
    blurType: resolveBlurType(object.sniptaleBlurType),
    ...getBlurBorderSettings(object),
    showBorder: object.sniptaleBlurShowBorder ?? DEFAULT_BLUR_SETTINGS.showBorder ?? false,
  };
}
