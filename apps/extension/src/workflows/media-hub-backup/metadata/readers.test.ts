import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

describe('media hub backup metadata readers', () => {
  it('reads primitive metadata values with strict types', async () => {
    const { field, readNullableNumber, readNullableString, readNumber, readRecord, readString } =
      await import('./readers');
    const record = readRecord({ count: 1, name: 'backup' });

    expect(field(record, 'name')).toBe('backup');
    expect(readString(field(record, 'name'))).toBe('backup');
    expect(readNumber(field(record, 'count'))).toBe(1);
    expect(readNullableString(null)).toBeNull();
    expect(readNullableNumber(null)).toBeNull();
    expect(() => readRecord([])).toThrow('shared.mediaHub.backupMetadataCorrupted');
    expect(() => readString(1)).toThrow('shared.mediaHub.backupMetadataCorrupted');
    expect(() => readNumber(Number.NaN)).toThrow('shared.mediaHub.backupMetadataCorrupted');
  });

  it('rejects unsafe arrays and archive paths', async () => {
    const { readNullablePath, readPath, readRecordArray, readStringArray } =
      await import('./readers');

    expect(readStringArray(['a', 'b'])).toEqual(['a', 'b']);
    expect(readRecordArray([{ id: 'asset-1' }])).toEqual([{ id: 'asset-1' }]);
    expect(readNullablePath(null, ['assets/'])).toBeNull();
    expect(readPath('assets/asset-1', ['assets/'])).toBe('assets/asset-1');
    expect(() => readStringArray(['ok', 1])).toThrow('shared.mediaHub.backupMetadataCorrupted');
    expect(() => readRecordArray([{ blob: {} }])).toThrow(
      'shared.mediaHub.backupMetadataCorrupted'
    );
    expect(() => readPath('../asset', ['assets/'])).toThrow(
      'shared.mediaHub.backupMetadataCorrupted'
    );
    expect(() => readPath('other/asset', ['assets/'])).toThrow(
      'shared.mediaHub.backupMetadataCorrupted'
    );
  });
});
