export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseDbEntries<T>(
  values: unknown[],
  parseEntry: (value: unknown) => T | null
): T[] {
  return values.flatMap((value) => {
    const parsedEntry = parseEntry(value);
    return parsedEntry ? [parsedEntry] : [];
  });
}
