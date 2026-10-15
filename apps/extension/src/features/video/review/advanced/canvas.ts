import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { QuickEditCanvasSize, QuickEditRect } from './types';

/** Source-normalized bounds remain independent of output resolution and camera authoring. */
function parseSourceCrop(value: unknown): QuickEditRect | null {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(7680 / width) ||
    !Number.isFinite(7680 / height) ||
    x + width > 1 ||
    y + height > 1
  )
    return null;
  return { x, y, width, height };
}

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
  const crop = value['crop'] === undefined ? undefined : parseSourceCrop(value['crop']);
  if (crop === null) return null;
  return { width, height, ...(crop ? { crop } : {}) };
}

/** Keep the selected center and source area when the canvas aspect changes. */
export function fitQuickEditSourceCrop(
  source: { width: number; height: number },
  canvas: { width: number; height: number },
  previous?: QuickEditRect
): QuickEditRect {
  const aspect = (canvas.width * source.height) / (canvas.height * source.width);
  const area = previous ? previous.width * previous.height : 1;
  // A derived crop cannot magnify less than one source pixel in either dimension.
  const minimumWidth = Math.min(1, aspect, Math.max(1 / source.width, aspect / source.height));
  let width = Math.max(minimumWidth, Math.sqrt(area * aspect));
  let height = width / aspect;
  const fit = Math.min(1, 1 / width, 1 / height);
  width *= fit;
  height *= fit;
  const cx = previous ? previous.x + previous.width / 2 : 0.5;
  const cy = previous ? previous.y + previous.height / 2 : 0.5;
  return {
    x: Math.max(0, Math.min(1 - width, cx - width / 2)),
    y: Math.max(0, Math.min(1 - height, cy - height / 2)),
    width,
    height,
  };
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

/** Recover source bounds from a visible crop; callers own any raster snapping before this operation. */
export function uncropQuickEditVideoRect(
  visible: QuickEditRect,
  crop: QuickEditRect
): QuickEditRect {
  return {
    x: visible.x - (crop.x * visible.width) / crop.width,
    y: visible.y - (crop.y * visible.height) / crop.height,
    width: visible.width / crop.width,
    height: visible.height / crop.height,
  };
}
