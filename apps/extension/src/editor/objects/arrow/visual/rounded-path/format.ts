export function formatPathNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
