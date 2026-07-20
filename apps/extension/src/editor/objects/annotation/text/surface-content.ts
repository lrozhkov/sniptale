import type { Textbox } from 'fabric';
import type {
  EditorTextCalloutFormat,
  EditorTextVerticalAlign,
} from '../../../../features/editor/document/text';
import { normalizeTextLayoutMode } from './mode';
import { createTextCalloutLocalRect, getTextCalloutBodyRect } from './surface-frame';
import { getMeasuredTextContentHeight, getTextCalloutPadding } from './surface-measurement';
import type { Size, TextCalloutRect } from './surface-types';

function resolveTextVerticalAlign(value: unknown): EditorTextVerticalAlign {
  switch (value) {
    case 'center':
    case 'bottom':
      return value;
    default:
      return 'top';
  }
}

export function getTextCalloutContentSize(
  surface: Size,
  textbox: Pick<Textbox, 'padding'>,
  format: EditorTextCalloutFormat
): Size {
  const padding = getTextCalloutPadding(textbox);
  const body = getTextCalloutBodyRect(surface, format);

  return {
    height: Math.max(1, body.height - padding * 2),
    width: Math.max(1, body.width - padding * 2),
  };
}

export function getTextCalloutContentRect(
  surface: Size,
  textbox: Pick<
    Textbox,
    'fontSize' | 'height' | 'sniptaleTextLayoutMode' | 'sniptaleTextVerticalAlign' | 'padding'
  >,
  format: EditorTextCalloutFormat
): TextCalloutRect {
  const body = getTextCalloutBodyRect(surface, format);
  const padding = getTextCalloutPadding(textbox);
  const content = getTextCalloutContentSize(surface, textbox, format);
  const occupiedHeight = Math.max(
    1,
    getMeasuredTextContentHeight(textbox) ?? textbox.height ?? textbox.fontSize ?? 1
  );
  const spareHeight = Math.max(0, content.height - occupiedHeight);
  const verticalAlign =
    normalizeTextLayoutMode(textbox.sniptaleTextLayoutMode) === 'fixed-width'
      ? resolveTextVerticalAlign(textbox.sniptaleTextVerticalAlign)
      : 'top';
  const verticalOffset =
    verticalAlign === 'bottom' ? spareHeight : verticalAlign === 'center' ? spareHeight / 2 : 0;

  return createTextCalloutLocalRect(
    body.left + (body.width - content.width) / 2,
    body.top + padding + verticalOffset,
    content.width,
    content.height
  );
}
