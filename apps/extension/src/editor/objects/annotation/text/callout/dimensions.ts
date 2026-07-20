import type { Textbox } from 'fabric';

import {
  getMinimumTextCalloutSurfaceSize,
  getScaledTextCalloutSurfaceSize,
  getTextCalloutSurfaceSize,
} from '../geometry';
import { resolveTextCalloutFormat } from './format';

export function getTextCalloutDimensions(textbox: Textbox): { height: number; width: number } {
  return getTextCalloutSurfaceSize(textbox, resolveTextCalloutFormat(textbox));
}

export function getScaledTextCalloutDimensions(textbox: Textbox): {
  height: number;
  width: number;
} {
  return getScaledTextCalloutSurfaceSize(textbox, resolveTextCalloutFormat(textbox));
}

export function getScaledTextCalloutResizeDimensions(
  textbox: Textbox,
  options: { preserveStoredWidth?: boolean } = {}
): {
  height: number;
  width: number;
} {
  const format = resolveTextCalloutFormat(textbox);
  const liveSurface = getMinimumTextCalloutSurfaceSize(textbox, format);
  const storedSurface = getTextCalloutSurfaceSize(textbox, format);
  const widthSurface = options.preserveStoredWidth ? storedSurface : liveSurface;

  return {
    height: storedSurface.height * Math.abs(textbox.scaleY ?? 1),
    width: widthSurface.width * Math.abs(textbox.scaleX ?? 1),
  };
}
