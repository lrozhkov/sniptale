export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isOptionalStringRecord(
  value: unknown
): value is Record<string, string> | undefined {
  if (value === undefined) {
    return true;
  }

  if (!isObjectRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}
