import type { EditorTextSettings } from '../../../../features/editor/document/types';
import { clamp, hexToRgba, isTransparentColor } from '../../../document/model';
import { createFabricShadow } from '../../shadow';

export function getTextGlyphBackgroundColor(settings: EditorTextSettings): string {
  if (settings.calloutFormat !== 'plain' || isTransparentColor(settings.backgroundColor)) {
    return '';
  }

  const opacity = clamp(settings.backgroundOpacity ?? 1, 0, 1);
  return opacity <= 0 ? '' : hexToRgba(settings.backgroundColor, opacity);
}

export function getTextFillColor(settings: EditorTextSettings): string {
  return hexToRgba(settings.textColor, clamp(settings.textOpacity ?? 1, 0, 1));
}

export function createTextFabricShadow(settings: EditorTextSettings) {
  if (settings.calloutFormat !== 'plain') {
    return undefined;
  }

  return createFabricShadow(settings.shadow, settings.shadowColor || settings.textColor, {
    angle: settings.shadowAngle ?? 90,
    blur: settings.shadowBlur ?? 12,
    distance: settings.shadowDistance ?? 4,
  });
}
