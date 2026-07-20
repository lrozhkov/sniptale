import type { EditorTextSettings } from '../../../../features/editor/document/types';

import { resizeTextCallout } from '../../../objects/annotation/text/callout/resize';
import { DEFAULT_EDITOR_TEXTBOX_WIDTH } from '../../../objects/annotation/text';
import type { createTextObject } from '../../../objects/annotation/text';
import { fontFamilyToCss } from '../../../document/model';
import type { EditorTechnicalDataLayout } from '../technical-data';

function measureTechnicalDataRowTextWidth(
  text: string,
  textSettings: EditorTextSettings
): number | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const context = document.createElement('canvas').getContext('2d');
  if (!context) {
    return null;
  }
  context.font = [
    textSettings.fontStyle,
    textSettings.fontWeight,
    `${textSettings.fontSize}px`,
    fontFamilyToCss(textSettings.fontFamily),
  ].join(' ');
  return Math.ceil(context.measureText(text).width) + 2;
}

function getTechnicalDataTextWidth(
  text: string,
  layout: EditorTechnicalDataLayout,
  textSettings: EditorTextSettings
): number {
  if (layout !== 'row') {
    return DEFAULT_EDITOR_TEXTBOX_WIDTH;
  }
  const measuredWidth = measureTechnicalDataRowTextWidth(text, textSettings);
  const fallbackWidth = Math.ceil(text.length * Math.max(10, textSettings.fontSize * 0.72));
  return Math.max(DEFAULT_EDITOR_TEXTBOX_WIDTH, measuredWidth ?? fallbackWidth);
}

export function resizeTechnicalDataTextObject(
  text: ReturnType<typeof createTextObject>,
  content: string,
  layout: EditorTechnicalDataLayout,
  textSettings: EditorTextSettings
): void {
  const width = getTechnicalDataTextWidth(content, layout, textSettings);
  if (layout === 'row') {
    resizeTextCallout(text, width, 1);
    return;
  }
  text.set({ width });
}
