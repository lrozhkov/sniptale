import { describe, expect, it } from 'vitest';

import { parseStoredEntries, parseStoredEntry } from './entries';

function isNamedEntry(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

describe('db guard entry helpers', () => {
  it('parses a valid stored entry and rejects invalid values', () => {
    expect(parseStoredEntry({ id: 'entry-1' }, isNamedEntry)).toEqual({ id: 'entry-1' });
    expect(parseStoredEntry({ id: 1 }, isNamedEntry)).toBeNull();
  });

  it('parses entry arrays and reports invalid roots and invalid items', () => {
    expect(parseStoredEntries({ broken: true }, isNamedEntry)).toEqual({
      entries: [],
      hasInvalidRoot: true,
      invalidEntryCount: 0,
    });

    expect(parseStoredEntries([{ id: 'entry-1' }, { broken: true }], isNamedEntry)).toEqual({
      entries: [{ id: 'entry-1' }],
      hasInvalidRoot: false,
      invalidEntryCount: 1,
    });
  });
});
