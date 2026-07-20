import type { Textbox } from 'fabric';
import type { EditorTextSettings } from '../../../../../features/editor/document/types';

import { CALLOUT_PADDING } from '../geometry';
import { normalizeTextCalloutFormat } from '../interaction';

export function resolveTextCalloutFormat(textbox: Textbox) {
  return normalizeTextCalloutFormat(textbox.sniptaleTextCalloutFormat);
}

export function getTextCalloutBackgroundColor(settings: EditorTextSettings): string {
  return settings.calloutFormat === 'plain' ? '' : settings.backgroundColor;
}

export function getTextCalloutPadding(
  format: ReturnType<typeof normalizeTextCalloutFormat>
): number {
  return format === 'plain' ? 0 : CALLOUT_PADDING;
}
