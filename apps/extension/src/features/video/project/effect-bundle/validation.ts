export function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

export function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[] | ReadonlySet<string>,
  optional: readonly string[] = []
): boolean {
  const requiredKeys = [...keys];
  const allowed = new Set(requiredKeys);
  const optionalKeys = new Set(optional);
  return (
    Object.keys(value).every((key) => allowed.has(key)) &&
    requiredKeys.every((key) => optionalKeys.has(key) || Object.hasOwn(value, key))
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
