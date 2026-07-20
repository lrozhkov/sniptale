export function clampRichShapeOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function richShapeTransparencyToOpacity(value: number): number {
  return clampRichShapeOpacity(value > 1 ? 1 - value / 100 : 1 - value);
}
