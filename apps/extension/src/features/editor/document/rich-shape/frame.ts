import { DEFAULT_RICH_SHAPE_FRAME } from './defaults';
import type { EditorRichShapeFrame } from './types';
import { isRecord, numberOr } from './values';

export function normalizeFrame(value: unknown): EditorRichShapeFrame {
  const frame = isRecord(value) ? value : {};
  return {
    left: numberOr(frame['left'], DEFAULT_RICH_SHAPE_FRAME.left),
    top: numberOr(frame['top'], DEFAULT_RICH_SHAPE_FRAME.top),
    width: numberOr(frame['width'], DEFAULT_RICH_SHAPE_FRAME.width),
    height: numberOr(frame['height'], DEFAULT_RICH_SHAPE_FRAME.height),
  };
}
