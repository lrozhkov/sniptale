/** Logical coordinates are bounded independently from physical bitmap allocation budgets. */
export function parseEffectLogicalDimensions(
  width: unknown,
  height: unknown
): { width: number; height: number } | null {
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  return Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= 1_000_000 &&
    height <= 1_000_000
    ? { width, height }
    : null;
}
