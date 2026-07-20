import type { EditorTextCalloutFormat } from '../../../../features/editor/document/text';
import {
  ARROW_BUBBLE_SHOULDER_OFFSET,
  ARROW_BUBBLE_TAIL_HALF_WIDTH,
  ARROW_BUBBLE_TAIL_HEIGHT,
  BUBBLE_TAIL_HALF_WIDTH,
  BUBBLE_TAIL_HEIGHT,
  CALLOUT_FRAME_GUTTER_X,
  CALLOUT_FRAME_GUTTER_Y,
  FLAG_NOTCH_WIDTH,
  POINTER_TAIL_WIDTH,
} from './constants';
import type { Size, TextCalloutRect } from './surface-types';

export function createTextCalloutLocalRect(
  left: number,
  top: number,
  width: number,
  height: number
): TextCalloutRect {
  return {
    height: Math.max(1, height),
    left,
    top,
    width: Math.max(1, width),
  };
}

function getInnerFrameRect(surface: Size): TextCalloutRect {
  return createTextCalloutLocalRect(
    CALLOUT_FRAME_GUTTER_X,
    CALLOUT_FRAME_GUTTER_Y,
    surface.width - CALLOUT_FRAME_GUTTER_X * 2,
    surface.height - CALLOUT_FRAME_GUTTER_Y * 2
  );
}

function clampTailWidth(surfaceWidth: number, value: number): number {
  return Math.max(12, Math.min(Math.round(surfaceWidth / 3), value));
}

function clampTailHeight(surfaceHeight: number, value: number): number {
  return Math.max(8, Math.min(Math.round(surfaceHeight / 3), value));
}

export function getTextCalloutTailMetrics(
  surface: Size,
  format: Exclude<EditorTextCalloutFormat, 'plain' | 'panel'>
): {
  halfWidth?: number;
  height?: number;
  notchWidth?: number;
  shoulderOffset?: number;
  width?: number;
} {
  switch (format) {
    case 'bubble':
      return {
        halfWidth: clampTailWidth(surface.width, BUBBLE_TAIL_HALF_WIDTH),
        height: clampTailHeight(surface.height, BUBBLE_TAIL_HEIGHT),
      };
    case 'arrow-bubble':
      return {
        halfWidth: clampTailWidth(surface.width, ARROW_BUBBLE_TAIL_HALF_WIDTH),
        height: clampTailHeight(surface.height, ARROW_BUBBLE_TAIL_HEIGHT),
        shoulderOffset: ARROW_BUBBLE_SHOULDER_OFFSET,
      };
    case 'pointer':
      return { width: clampTailWidth(surface.width, POINTER_TAIL_WIDTH) };
    case 'flag':
      return { notchWidth: clampTailWidth(surface.width, FLAG_NOTCH_WIDTH) };
  }
}

export function getTextCalloutBodyRect(
  surface: Size,
  format: EditorTextCalloutFormat
): TextCalloutRect {
  if (format === 'plain') {
    return createTextCalloutLocalRect(0, 0, surface.width, surface.height);
  }

  const frame = getInnerFrameRect(surface);
  switch (format) {
    case 'panel':
      return frame;
    case 'bubble':
      return createTextCalloutLocalRect(
        frame.left,
        frame.top,
        frame.width,
        frame.height - clampTailHeight(surface.height, BUBBLE_TAIL_HEIGHT)
      );
    case 'arrow-bubble':
      return createTextCalloutLocalRect(
        frame.left,
        frame.top,
        frame.width,
        frame.height - clampTailHeight(surface.height, ARROW_BUBBLE_TAIL_HEIGHT)
      );
    case 'pointer': {
      const tailWidth = clampTailWidth(surface.width, POINTER_TAIL_WIDTH);
      return createTextCalloutLocalRect(
        frame.left + tailWidth,
        frame.top,
        frame.width - tailWidth,
        frame.height
      );
    }
    case 'flag':
      return createTextCalloutLocalRect(
        frame.left,
        frame.top,
        frame.width - clampTailWidth(surface.width, FLAG_NOTCH_WIDTH),
        frame.height
      );
  }
}
