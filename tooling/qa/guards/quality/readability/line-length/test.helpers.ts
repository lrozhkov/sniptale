export function buildLongLine(length: number) {
  const prefix = "const value = '";
  const suffix = "';";

  return `${prefix}${'x'.repeat(Math.max(0, length - prefix.length - suffix.length))}${suffix}`;
}
