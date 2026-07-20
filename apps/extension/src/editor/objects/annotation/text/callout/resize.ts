import type { Textbox } from 'fabric';

import { getTextCalloutSurfaceSize } from '../geometry';
import { applyTextLayout } from '../layout';
import { resolveTextCalloutFormat } from './format';

export function resizeTextCallout(textbox: Textbox, width: number, height: number): void {
  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  const format = resolveTextCalloutFormat(textbox);
  const surfaceWidth = format === 'plain' ? nextWidth : Math.max(1, Math.round(width));

  applyTextLayout(textbox, {
    layoutMode: 'fixed-width',
    surfaceHeight: nextHeight,
    surfaceWidth,
  });
  const surface = getTextCalloutSurfaceSize(textbox, format);
  textbox.sniptaleTextCalloutWidth = surface.width ?? surfaceWidth;
  textbox.sniptaleTextCalloutHeight = surface.height ?? nextHeight;
}
