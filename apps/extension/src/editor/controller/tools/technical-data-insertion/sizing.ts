import type { Textbox } from 'fabric';
import {
  resolveDrawingTextFontFamily,
  type DrawingToolDefaults,
} from '../../../../features/drawing/public';
import type { EditorTechnicalDataLayout } from '../technical-data';

function measureTechnicalDataRowTextWidth(
  text: string,
  textSettings: DrawingToolDefaults['text']
): number | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const context = document.createElement('canvas').getContext('2d');
  if (!context) {
    return null;
  }
  context.font = [
    `${textSettings.fontSize}px`,
    resolveDrawingTextFontFamily(textSettings.fontFamily),
  ].join(' ');
  return Math.ceil(context.measureText(text).width) + 2;
}

function getTechnicalDataTextWidth(
  text: string,
  layout: EditorTechnicalDataLayout,
  textSettings: DrawingToolDefaults['text']
): number {
  if (layout !== 'row') {
    return 360;
  }
  const measuredWidth = measureTechnicalDataRowTextWidth(text, textSettings);
  const fallbackWidth = Math.ceil(text.length * Math.max(10, textSettings.fontSize * 0.72));
  return Math.max(360, measuredWidth ?? fallbackWidth);
}

export function resizeTechnicalDataTextObject(
  text: Textbox,
  content: string,
  layout: EditorTechnicalDataLayout,
  textSettings: DrawingToolDefaults['text']
): void {
  const width = getTechnicalDataTextWidth(content, layout, textSettings);
  text.set({ width });
}
