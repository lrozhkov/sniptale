import {
  assertRasterSize,
  assertSelectionMask,
  assertSourcePoint,
  type PixelBounds,
  type RasterSize,
  type RasterSourceGeometry,
  type SelectionMask,
  type SourcePoint,
} from './contracts';

/** Rasterize a rectangle at pixel centers. Reversed corners are accepted; edges are half-open. */
export function rectangleMask(size: RasterSize, start: SourcePoint, end: SourcePoint): Uint8Array {
  const count = assertRasterSize(size);
  assertSourcePoint(start);
  assertSourcePoint(end);
  const result = new Uint8Array(count);
  const left = Math.max(0, Math.ceil(Math.min(start.x, end.x) - 0.5));
  const right = Math.min(size.width, Math.ceil(Math.max(start.x, end.x) - 0.5));
  const top = Math.max(0, Math.ceil(Math.min(start.y, end.y) - 0.5));
  const bottom = Math.min(size.height, Math.ceil(Math.max(start.y, end.y) - 0.5));
  if (right > left) {
    for (let y = top; y < bottom; y++)
      result.fill(255, y * size.width + left, y * size.width + right);
  }
  return result;
}

/**
 * Rasterize closed contours with the even-odd rule across all contours.
 * Each contour needs at least three points; repeated closing points are allowed.
 * Pixel centers on an edge use half-open scanline coverage, as rectangles do.
 */
export function lassoMask(
  size: RasterSize,
  contours: readonly (readonly SourcePoint[])[]
): Uint8Array {
  const count = assertRasterSize(size);
  for (const contour of contours) {
    if (contour.length < 3) throw new RangeError('A closed lasso needs at least three points');
    for (const point of contour) assertSourcePoint(point);
  }
  const result = new Uint8Array(count);
  for (let y = 0; y < size.height; y++) {
    const center = y + 0.5;
    const intersections: number[] = [];
    for (const contour of contours) {
      for (let i = 0; i < contour.length; i++) {
        const a = contour[i]!;
        const b = contour[(i + 1) % contour.length]!;
        if (a.y > center === b.y > center) continue;
        intersections.push(a.x + ((center - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(0, Math.ceil(intersections[i]! - 0.5));
      const right = Math.min(size.width, Math.ceil(intersections[i + 1]! - 0.5));
      if (right > left) result.fill(255, y * size.width + left, y * size.width + right);
    }
  }
  return result;
}

/**
 * Return an independent mask. New replaces the selection. Add with null starts
 * a selection; subtract with null removes from the full image. Empty stays explicit.
 */
export function combineSelection(
  size: RasterSize,
  current: SelectionMask,
  incoming: Uint8Array,
  mode: 'new' | 'add' | 'subtract'
): Uint8Array {
  const count = assertRasterSize(size);
  assertSelectionMask(current, count);
  assertSelectionMask(incoming, count);
  if (mode !== 'new' && mode !== 'add' && mode !== 'subtract')
    throw new RangeError('Invalid selection mode');
  const result = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (mode === 'new' || (mode === 'add' && current === null)) result[i] = incoming[i]!;
    else if (mode === 'add') result[i] = current?.[i] || incoming[i]!;
    else result[i] = incoming[i] ? 0 : (current?.[i] ?? 255);
  }
  return result;
}

/** Invert the image-bounded mask. An unrestricted selection becomes explicitly empty. */
export function invertSelection(size: RasterSize, current: SelectionMask): Uint8Array {
  const count = assertRasterSize(size);
  assertSelectionMask(current, count);
  const result = new Uint8Array(count);
  for (let i = 0; i < count; i++) result[i] = 255 - (current?.[i] ?? 255);
  return result;
}

/** Clear the selection and restore unrestricted operations. */
export function clearSelection(): null {
  return null;
}

/** Return selected pixel bounds, full image bounds for null, or null for an empty mask. */
export function selectionBounds(size: RasterSize, mask: SelectionMask): PixelBounds | null {
  const count = assertRasterSize(size);
  assertSelectionMask(mask, count);
  if (mask === null) return { x: 0, y: 0, width: size.width, height: size.height };
  let left = size.width;
  let top = size.height;
  let right = -1;
  let bottom = -1;
  for (let i = 0; i < count; i++) {
    if (!mask[i]) continue;
    const x = i % size.width;
    const y = Math.floor(i / size.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return right < left
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Wrap a sample into a source rectangle. A size without an origin starts at zero. */
export function wrapRasterSourcePoint(
  size: RasterSize & Partial<SourcePoint>,
  point: SourcePoint
): SourcePoint {
  const x = size.x ?? 0;
  const y = size.y ?? 0;
  return {
    x: x + ((((point.x - x) % size.width) + size.width) % size.width),
    y: y + ((((point.y - y) % size.height) + size.height) % size.height),
  };
}

function contains(bounds: PixelBounds, point: SourcePoint): boolean {
  return (
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x < bounds.x + bounds.width &&
    point.y < bounds.y + bounds.height
  );
}

/** Check scene clipping before modulo, then restrict samples to the working source crop. */
export function isRasterSourcePointVisible(
  geometry: RasterSourceGeometry,
  point: SourcePoint
): boolean {
  if (geometry.sourceClip && !contains(geometry.sourceClip, point)) return false;
  if (geometry.sceneClip) {
    assertSourcePoint(point);
    const [a, b, c, d, e, f] = geometry.sourceToScene;
    const scene = { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
    if (!contains(geometry.sceneClip, scene)) return false;
  }
  const sample = geometry.periodic ? wrapRasterSourcePoint(geometry.crop, point) : point;
  return (
    contains(geometry.crop, sample) &&
    contains({ x: 0, y: 0, width: geometry.width, height: geometry.height }, sample)
  );
}

/** Intersect the working source crop with selection and nonperiodic visible bounds. */
export function workingSelectionMask(
  geometry: RasterSourceGeometry,
  selection: SelectionMask
): Uint8Array {
  const { width, height, crop: bounds } = geometry;
  const mask = rectangleMask(
    { width, height },
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
  );
  // Periodic copies share the retained source crop; a source edit changes every repetition.
  for (let i = 0; i < mask.length; i++) {
    if (
      (selection && !selection[i]) ||
      (!geometry.periodic &&
        !isRasterSourcePointVisible(geometry, {
          x: (i % width) + 0.5,
          y: Math.floor(i / width) + 0.5,
        }))
    )
      mask[i] = 0;
  }
  return mask;
}

/** Clip an unwrapped shape before folding periodic coverage into retained source pixels. */
export function gestureSelectionMask(
  geometry: RasterSourceGeometry,
  points: readonly SourcePoint[],
  kind: 'rectangle' | 'lasso'
): Uint8Array {
  const first = points[0]!,
    last = points[points.length - 1]!;
  if (!geometry.periodic) {
    const result =
      kind === 'lasso' && points.length >= 3
        ? lassoMask(geometry, [points])
        : rectangleMask(geometry, first, last);
    for (let i = 0; i < result.length; i++)
      if (
        result[i] &&
        !isRasterSourcePointVisible(geometry, {
          x: (i % geometry.width) + 0.5,
          y: Math.floor(i / geometry.width) + 0.5,
        })
      )
        result[i] = 0;
    return result;
  }
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const left = Math.floor(Math.min(...xs)),
    top = Math.floor(Math.min(...ys));
  const width = Math.max(1, Math.ceil(Math.max(...xs)) - left),
    height = Math.max(1, Math.ceil(Math.max(...ys)) - top);
  const local = points.map((p) => ({ x: p.x - left, y: p.y - top }));
  const window =
    kind === 'lasso' && local.length >= 3
      ? lassoMask({ width, height }, [local])
      : rectangleMask({ width, height }, local[0]!, local[local.length - 1]!);
  const result = new Uint8Array(geometry.width * geometry.height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (
        window[y * width + x] &&
        isRasterSourcePointVisible(geometry, { x: left + x + 0.5, y: top + y + 0.5 })
      ) {
        const wrapped = wrapRasterSourcePoint(geometry.crop, { x: left + x, y: top + y });
        result[wrapped.y * geometry.width + wrapped.x] = 255;
      }
  return result;
}
