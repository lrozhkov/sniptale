export interface ParsedStoredEntriesValue<TEntry> {
  entries: TEntry[];
  hasInvalidRoot: boolean;
  invalidEntryCount: number;
}

export function parseStoredEntry<TEntry>(
  value: unknown,
  isEntry: (value: unknown) => value is TEntry
): TEntry | null {
  return isEntry(value) ? value : null;
}

export function parseStoredEntries<TEntry>(
  value: unknown,
  isEntry: (value: unknown) => value is TEntry
): ParsedStoredEntriesValue<TEntry> {
  if (!Array.isArray(value)) {
    return { entries: [], hasInvalidRoot: value !== undefined, invalidEntryCount: 0 };
  }

  const entries = value.filter(isEntry);
  return {
    entries,
    hasInvalidRoot: false,
    invalidEntryCount: value.length - entries.length,
  };
}
