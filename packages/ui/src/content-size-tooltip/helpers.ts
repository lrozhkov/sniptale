export function parsePositiveInteger(value: string): number | null {
  const nextValue = Number.parseInt(value, 10);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : null;
}
