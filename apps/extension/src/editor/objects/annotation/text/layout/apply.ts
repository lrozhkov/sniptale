import type { Textbox } from 'fabric';
import { normalizeTextCalloutFormat } from '../interaction';
import { normalizeTextLayoutMode } from '../mode';
import {
  resolveFixedContentWidth,
  resolveFixedSurfaceWidth,
  resolveMeasuredTextWidth,
  syncPlainFixedSurfaceHeight,
  syncStoredSurfaceSize,
} from './measure';
import type { LayoutTextbox } from './types';

export function applyTextLayout(
  textbox: Textbox,
  options: {
    layoutMode?: ReturnType<typeof normalizeTextLayoutMode>;
    surfaceHeight?: number;
    surfaceWidth?: number;
  } = {}
): void {
  const format = normalizeTextCalloutFormat(textbox.sniptaleTextCalloutFormat);
  const layoutMode = normalizeTextLayoutMode(options.layoutMode ?? textbox.sniptaleTextLayoutMode);
  const layoutOptions = {
    layoutMode,
    surfaceHeight: options.surfaceHeight,
    surfaceWidth: options.surfaceWidth,
  };

  textbox.sniptaleTextLayoutMode = layoutMode;
  if (typeof (textbox as LayoutTextbox).set !== 'function') {
    return;
  }

  if (layoutMode === 'auto') {
    textbox.set({
      scaleX: 1,
      scaleY: 1,
      width: resolveMeasuredTextWidth(textbox as LayoutTextbox),
    });
    textbox.initDimensions?.();
    syncStoredSurfaceSize(textbox, format, layoutOptions);
    return;
  }

  const surfaceWidth = resolveFixedSurfaceWidth(textbox, options.surfaceWidth, format);
  const contentWidth = resolveFixedContentWidth(textbox, surfaceWidth, format);

  textbox.set({
    scaleX: 1,
    scaleY: 1,
    width: Math.max(1, Math.round(contentWidth)),
  });
  textbox.initDimensions?.();
  syncStoredSurfaceSize(textbox, format, layoutOptions);
  syncPlainFixedSurfaceHeight(textbox, format, layoutMode);
}
