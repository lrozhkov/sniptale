import type { BlurSettings } from '../../../features/highlighter/contracts';
import { DEFAULT_BLUR_SETTINGS } from '../../../features/highlighter/style/defaults';

type BlurControlStrokeStyle = 'solid' | 'dash' | 'dot' | 'dash-dot' | 'long-dash';

function resolveBlurControlStrokeStyle(
  strokeStyle: BlurSettings['strokeStyle'] | undefined
): BlurControlStrokeStyle {
  if (strokeStyle === 'dashed') {
    return 'dash';
  }

  if (strokeStyle === 'dotted') {
    return 'dot';
  }

  if (
    strokeStyle === 'solid' ||
    strokeStyle === 'dash' ||
    strokeStyle === 'dot' ||
    strokeStyle === 'dash-dot' ||
    strokeStyle === 'long-dash'
  ) {
    return strokeStyle;
  }

  return 'solid';
}

export function resolveBlurBorderSettings(settings: BlurSettings) {
  return {
    radius: settings.radius ?? DEFAULT_BLUR_SETTINGS.radius ?? 0,
    shadow: settings.shadow ?? DEFAULT_BLUR_SETTINGS.shadow ?? 0,
    strokeColor: settings.strokeColor ?? DEFAULT_BLUR_SETTINGS.strokeColor ?? '#475569',
    strokeOpacity: settings.strokeOpacity ?? DEFAULT_BLUR_SETTINGS.strokeOpacity ?? 1,
    strokeStyle: resolveBlurControlStrokeStyle(settings.strokeStyle),
    strokeWidth:
      settings.showBorder === false
        ? 0
        : (settings.strokeWidth ?? DEFAULT_BLUR_SETTINGS.strokeWidth ?? 0),
  };
}
