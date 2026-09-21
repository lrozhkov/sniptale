import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { QuickEditCanvasSize } from './types';

/** Custom canvases are codec-friendly, bounded to an 8K frame's pixel budget. */
export function parseQuickEditCanvas(value: unknown): QuickEditCanvasSize | null {
  if (!isRecord(value)) return null;
  const width = value['width'];
  const height = value['height'];
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 7680 ||
    height > 7680 ||
    width % 2 !== 0 ||
    height % 2 !== 0 ||
    width * height > 33_177_600
  )
    return null;
  return { width, height };
}

/** Preset resolution is the short edge, like the full video editor's canvas selector. */
export function quickEditCanvasPreset(
  x: number,
  y: number,
  shortEdge: number
): QuickEditCanvasSize {
  const unit = Math.min(
    shortEdge / Math.min(x, y),
    7680 / Math.max(x, y),
    Math.sqrt(33_177_600 / (x * y))
  );
  return {
    width: Math.max(2, Math.round((x * unit) / 2) * 2),
    height: Math.max(2, Math.round((y * unit) / 2) * 2),
  };
}
