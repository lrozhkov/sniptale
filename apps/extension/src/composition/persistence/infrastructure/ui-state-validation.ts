import { isBoolean, isString } from './guards/primitives';

export function parseStoredBooleanFlag(value: unknown): boolean | null {
  return isBoolean(value) ? value : null;
}

export function resolveStoredBooleanFlag(
  record: Readonly<Record<string, unknown>>,
  storageKey: string,
  reportInvalid: (storageKey: string) => void
): boolean {
  const storedValue = record[storageKey];
  const parsed = parseStoredBooleanFlag(storedValue);
  if (parsed === null && storedValue !== undefined) {
    reportInvalid(storageKey);
  }
  return parsed ?? false;
}

export function parseStoredStringList(
  value: unknown,
  maxItems: number
): { hasInvalidRoot: boolean; invalidEntryCount: number; value: string[] } {
  if (value === undefined) {
    return { hasInvalidRoot: false, invalidEntryCount: 0, value: [] };
  }
  if (!Array.isArray(value)) {
    return { hasInvalidRoot: true, invalidEntryCount: 0, value: [] };
  }

  const nextValue: string[] = [];
  let invalidEntryCount = 0;
  for (const item of value) {
    if (isString(item)) {
      nextValue.push(item);
      if (nextValue.length === maxItems) break;
    } else {
      invalidEntryCount += 1;
    }
  }
  return { hasInvalidRoot: false, invalidEntryCount, value: nextValue };
}
