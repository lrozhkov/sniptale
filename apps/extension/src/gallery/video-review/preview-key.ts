/** Canonicalizes preview object keys while preserving array order and selected input values. */
export function previewKeyValue(_key: string, value: unknown): unknown {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
    : value;
}
