export function resolveRectangleScale(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? Math.abs(value) : 1;
}

export function resolveRectangleDimension(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function clampRectangleGeometry(
  outerSize: number,
  strokeWidth: number,
  scale: number
): number {
  return Math.max(1, (Math.max(0, outerSize) - strokeWidth) / scale);
}

export function resolveRectangleRenderRadius(
  radiusIntent: number,
  width: number,
  height: number
): number {
  return Math.min(Math.max(0, radiusIntent), Math.max(0, Math.min(width, height) / 2));
}
