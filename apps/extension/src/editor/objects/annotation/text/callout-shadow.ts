import type { Textbox } from 'fabric';
import { createFabricShadow } from '../../shadow';
import type { normalizeTextCalloutFormat } from './interaction';

export function createPlainTextCalloutShadow(
  textbox: Textbox,
  format: ReturnType<typeof normalizeTextCalloutFormat>
) {
  if (format !== 'plain') {
    return undefined;
  }

  const shadowColor =
    typeof textbox.sniptaleTextShadowColor === 'string' &&
    textbox.sniptaleTextShadowColor.trim().length > 0
      ? textbox.sniptaleTextShadowColor
      : typeof textbox.fill === 'string'
        ? textbox.fill
        : '#111827';

  return createFabricShadow(textbox.sniptaleTextCalloutShadow, shadowColor, {
    angle:
      typeof textbox.sniptaleTextShadowAngle === 'number' ? textbox.sniptaleTextShadowAngle : 90,
    blur: typeof textbox.sniptaleTextShadowBlur === 'number' ? textbox.sniptaleTextShadowBlur : 12,
    distance:
      typeof textbox.sniptaleTextShadowDistance === 'number'
        ? textbox.sniptaleTextShadowDistance
        : 4,
  });
}
