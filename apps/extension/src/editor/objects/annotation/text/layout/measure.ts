import type { Textbox } from 'fabric';
import {
  getTextCalloutContentSize,
  getTextCalloutSurfaceSize,
  setTextCalloutMeasuredContentHeight,
} from '../geometry';
import type { LayoutTextbox, TextCalloutFormat, TextLayoutMode, TextLayoutOptions } from './types';

const MIN_AUTO_TEXT_WIDTH = 32;
const DEFAULT_TEXTBOX_WIDTH_FALLBACK = 280;

export function resolveMeasuredTextWidth(textbox: LayoutTextbox): number {
  const measured = typeof textbox.calcTextWidth === 'function' ? textbox.calcTextWidth() : null;
  const fallback = textbox.width ?? DEFAULT_TEXTBOX_WIDTH_FALLBACK;

  return Math.max(MIN_AUTO_TEXT_WIDTH, Math.round(measured ?? fallback));
}

export function resolveFixedSurfaceWidth(
  textbox: Textbox,
  surfaceWidth: number | undefined,
  format: TextCalloutFormat
): number {
  if (typeof surfaceWidth === 'number' && Number.isFinite(surfaceWidth)) {
    return Math.max(1, Math.round(surfaceWidth));
  }

  if (format === 'plain') {
    return Math.max(1, Math.round(textbox.width ?? DEFAULT_TEXTBOX_WIDTH_FALLBACK));
  }

  return getTextCalloutSurfaceSize(textbox, format).width;
}

export function resolveFixedContentWidth(
  textbox: Textbox,
  surfaceWidth: number,
  format: TextCalloutFormat
): number {
  return format === 'plain'
    ? surfaceWidth
    : getTextCalloutContentSize({ height: 1, width: surfaceWidth }, textbox, format).width;
}

export function syncStoredSurfaceSize(
  textbox: Textbox,
  format: TextCalloutFormat,
  options: TextLayoutOptions
): void {
  const explicitSurfaceWidth =
    options.layoutMode === 'fixed-width' && typeof options.surfaceWidth === 'number'
      ? Math.max(1, Math.round(options.surfaceWidth))
      : null;
  const explicitSurfaceHeight =
    options.layoutMode === 'fixed-width' && typeof options.surfaceHeight === 'number'
      ? Math.max(1, Math.round(options.surfaceHeight))
      : null;
  if (explicitSurfaceWidth !== null) {
    textbox.sniptaleTextCalloutWidth = explicitSurfaceWidth;
  }
  if (explicitSurfaceHeight !== null) {
    textbox.sniptaleTextCalloutHeight = explicitSurfaceHeight;
  }
  const surface = getTextCalloutSurfaceSize(textbox, format);

  textbox.sniptaleTextCalloutWidth = explicitSurfaceWidth ?? surface.width;
  textbox.sniptaleTextCalloutHeight = explicitSurfaceHeight ?? surface.height;
}

export function syncPlainFixedSurfaceHeight(
  textbox: Textbox,
  format: TextCalloutFormat,
  layoutMode: TextLayoutMode
): void {
  if (format !== 'plain' || layoutMode !== 'fixed-width') {
    return;
  }

  const surface = getTextCalloutSurfaceSize(textbox, format);
  setTextCalloutMeasuredContentHeight(textbox, textbox.height ?? surface.height);
  textbox.set({ height: surface.height });
}
