export function readLineNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
