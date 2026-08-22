import { describe, expect, it } from 'vitest';
import {
  MAX_MEDIA_ARCHIVE_BYTES,
  MAX_MEDIA_ARCHIVE_ENTRIES,
  MAX_MEDIA_ARCHIVE_INFLATED_BYTES,
} from './contracts';
import {
  admitArchiveEntry,
  assertArchiveFileSize,
  assertArchiveTextSize,
  createArchiveBudget,
} from './profile';

describe('archive resource profile', () => {
  it('tracks admitted entries and inflated bytes', () => {
    const budget = createArchiveBudget();
    admitArchiveEntry(budget, 12);
    expect(budget).toEqual({ entries: 1, inflatedBytes: 12 });
  });

  it.each([-1, Number.NaN, MAX_MEDIA_ARCHIVE_INFLATED_BYTES + 1])(
    'rejects invalid entry size %s',
    (size) => expect(() => admitArchiveEntry(createArchiveBudget(), size)).toThrow('invalid size')
  );

  it('rejects aggregate entry count and inflated byte overflow', () => {
    const entryBudget = createArchiveBudget();
    entryBudget.entries = MAX_MEDIA_ARCHIVE_ENTRIES;
    expect(() => admitArchiveEntry(entryBudget, 0)).toThrow('resource profile');

    const byteBudget = createArchiveBudget();
    byteBudget.inflatedBytes = MAX_MEDIA_ARCHIVE_INFLATED_BYTES;
    expect(() => admitArchiveEntry(byteBudget, 1)).toThrow('resource profile');
  });

  it('enforces compressed archive and text entry budgets', () => {
    expect(() => assertArchiveFileSize(1)).not.toThrow();
    expect(() => assertArchiveFileSize(0)).toThrow('compressed byte budget');
    expect(() => assertArchiveFileSize(MAX_MEDIA_ARCHIVE_BYTES + 1)).toThrow(
      'compressed byte budget'
    );
    expect(() => assertArchiveTextSize(4, 4)).not.toThrow();
    expect(() => assertArchiveTextSize(5, 4)).toThrow('text entry');
    expect(() => assertArchiveTextSize(Number.NaN)).toThrow('text entry');
  });
});
