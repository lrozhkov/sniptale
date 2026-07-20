import type { RectangleLike } from './types';

export function resolveRectangleRenderRadius(
  radiusIntent: number,
  width: number,
  height: number
): number {
  return Math.min(Math.max(0, radiusIntent), Math.max(0, Math.min(width, height) / 2));
}

export function resolveRectangleIntentRadius(rect: RectangleLike): number {
  if (typeof rect.sniptaleShapeRadius === 'number' && Number.isFinite(rect.sniptaleShapeRadius)) {
    return Math.max(0, rect.sniptaleShapeRadius);
  }

  if (typeof rect.rx === 'number' && Number.isFinite(rect.rx)) {
    return Math.max(0, rect.rx);
  }

  return typeof rect.ry === 'number' && Number.isFinite(rect.ry) ? Math.max(0, rect.ry) : 0;
}
