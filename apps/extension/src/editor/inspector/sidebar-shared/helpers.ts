export function toNumber(value: string, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}
