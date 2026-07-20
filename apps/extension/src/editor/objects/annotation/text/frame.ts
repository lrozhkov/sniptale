import { CALLOUT_FRAME_GUTTER_X, CALLOUT_FRAME_GUTTER_Y } from './constants';

export interface TextCalloutFrame {
  height: number;
  left: number;
  top: number;
  width: number;
}

export function getTextCalloutFrame(surface: { height: number; width: number }): TextCalloutFrame {
  const gutterX = Math.min(CALLOUT_FRAME_GUTTER_X, Math.max(0, (surface.width - 1) / 2));
  const gutterY = Math.min(CALLOUT_FRAME_GUTTER_Y, Math.max(0, (surface.height - 1) / 2));

  return {
    height: Math.max(1, surface.height - gutterY * 2),
    left: -surface.width / 2 + gutterX,
    top: -surface.height / 2 + gutterY,
    width: Math.max(1, surface.width - gutterX * 2),
  };
}
