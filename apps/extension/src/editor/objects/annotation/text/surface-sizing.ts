import type { Textbox } from 'fabric';
import type { EditorTextCalloutFormat } from '../../../../features/editor/document/text';
import { CALLOUT_FRAME_GUTTER_X, CALLOUT_FRAME_GUTTER_Y } from './constants';
import { normalizeTextLayoutMode } from './mode';
import type { Size } from './surface-types';

export const DEFAULT_TEXT_CALLOUT_WIDTH = 420;
export const DEFAULT_TEXT_CALLOUT_HEIGHT = 120;

function getPadding(textbox: Pick<Textbox, 'padding'>): number {
  return typeof textbox.padding === 'number' ? textbox.padding : 0;
}

export function normalizeCalloutDimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(1, Math.round(value));
}

function getTextLayoutSize(
  textbox: Pick<Textbox, 'fontSize' | 'height' | 'padding' | 'width'>
): Size {
  const padding = getPadding(textbox);
  return {
    height: Math.max(1, (textbox.height ?? textbox.fontSize ?? 1) + padding * 2),
    width: Math.max(1, (textbox.width ?? 1) + padding * 2),
  };
}

export function getMinimumTextCalloutSurfaceSize(
  textbox: Pick<Textbox, 'fontSize' | 'height' | 'padding' | 'width'>,
  format: EditorTextCalloutFormat
): Size {
  const layout = getTextLayoutSize(textbox);
  if (format === 'plain') {
    return layout;
  }

  return {
    height: layout.height + CALLOUT_FRAME_GUTTER_Y * 2,
    width: layout.width + CALLOUT_FRAME_GUTTER_X * 2,
  };
}

export function getTextCalloutSurfaceSize(
  textbox: Pick<
    Textbox,
    | 'fontSize'
    | 'height'
    | 'sniptaleTextCalloutHeight'
    | 'sniptaleTextCalloutWidth'
    | 'sniptaleTextLayoutMode'
    | 'padding'
    | 'width'
  >,
  format: EditorTextCalloutFormat
): Size {
  const minimum = getMinimumTextCalloutSurfaceSize(textbox, format);
  if (format === 'plain') {
    if (normalizeTextLayoutMode(textbox.sniptaleTextLayoutMode) !== 'fixed-width') {
      return minimum;
    }

    return {
      height: Math.max(
        minimum.height,
        normalizeCalloutDimension(textbox.sniptaleTextCalloutHeight) ?? minimum.height
      ),
      width: Math.max(
        minimum.width,
        normalizeCalloutDimension(textbox.sniptaleTextCalloutWidth) ?? minimum.width
      ),
    };
  }

  if (normalizeTextLayoutMode(textbox.sniptaleTextLayoutMode) === 'auto') {
    return minimum;
  }

  return {
    height: Math.max(
      minimum.height,
      normalizeCalloutDimension(textbox.sniptaleTextCalloutHeight) ?? DEFAULT_TEXT_CALLOUT_HEIGHT
    ),
    width: Math.max(
      minimum.width,
      normalizeCalloutDimension(textbox.sniptaleTextCalloutWidth) ?? DEFAULT_TEXT_CALLOUT_WIDTH
    ),
  };
}

export function getScaledTextCalloutSurfaceSize(
  textbox: Pick<
    Textbox,
    | 'fontSize'
    | 'height'
    | 'sniptaleTextCalloutHeight'
    | 'sniptaleTextCalloutWidth'
    | 'padding'
    | 'scaleX'
    | 'scaleY'
    | 'width'
  >,
  format: EditorTextCalloutFormat
): Size {
  const surface = getTextCalloutSurfaceSize(textbox, format);
  return {
    height: surface.height * Math.abs(textbox.scaleY ?? 1),
    width: surface.width * Math.abs(textbox.scaleX ?? 1),
  };
}
