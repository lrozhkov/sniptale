export function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || Array.isArray(value)) return false;
  return typeof value === 'object';
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}
