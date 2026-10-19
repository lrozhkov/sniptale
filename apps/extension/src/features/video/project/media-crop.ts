import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

/** A rectangle normalized against the complete original media source. */
interface MediaSourceCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Source-normalized bounds remain independent of output resolution and camera authoring. */
export function parseMediaSourceCrop(value: unknown): MediaSourceCrop | null {
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

/** Recover source bounds from a visible crop; callers own any raster snapping before this operation. */
export function uncropMediaSourceRect(
  visible: { x: number; y: number; width: number; height: number },
  crop: MediaSourceCrop
) {
  return {
    x: visible.x - (crop.x * visible.width) / crop.width,
    y: visible.y - (crop.y * visible.height) / crop.height,
    width: visible.width / crop.width,
    height: visible.height / crop.height,
  };
}
