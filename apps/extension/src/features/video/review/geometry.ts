import type { ReviewRegion } from './types';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** Content rectangle in viewport pixels; source dimensions already include orientation. */
export function fitVideoRect(viewport: Size, source: Size): ReviewRegion {
  if (
    ![viewport.width, viewport.height, source.width, source.height].every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    throw new Error('Video dimensions are invalid.');
  const scale = Math.min(viewport.width / source.width, viewport.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height };
}

/** Rejects letterbox starts; an active drag can clamp its endpoint to the video edge. */
export function normalizeVideoPoint(
  point: Point,
  content: ReviewRegion,
  clamp = false
): Point | null {
  if (
    ![point.x, point.y, content.x, content.y, content.width, content.height].every(
      Number.isFinite
    ) ||
    content.width <= 0 ||
    content.height <= 0
  )
    return null;
  const x = (point.x - content.x) / content.width;
  const y = (point.y - content.y) / content.height;
  if (!clamp && (x < 0 || y < 0 || x > 1 || y > 1)) return null;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

/** Makes a normalized rectangle regardless of drag direction. */
export function regionFromPoints(start: Point, end: Point): ReviewRegion | null {
  if (
    ![start.x, start.y, end.x, end.y].every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1
    )
  )
    return null;
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return width > 0 && height > 0
    ? { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height }
    : null;
}

/** Projects the same saved rectangle onto a resized player or intrinsic frame. */
export function projectVideoRegion(region: ReviewRegion, content: ReviewRegion): ReviewRegion {
  return {
    x: content.x + region.x * content.width,
    y: content.y + region.y * content.height,
    width: region.width * content.width,
    height: region.height * content.height,
  };
}
