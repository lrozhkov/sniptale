export function clampBitmapCoordinate(value: number, max: number): number {
  return Math.max(0, Math.min(max - 1, Math.round(value)));
}
