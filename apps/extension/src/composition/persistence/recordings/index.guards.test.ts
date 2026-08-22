import { describe, expect, it } from 'vitest';

import { parseRecordingEntries, parseRecordingEntry } from './index.guards.ts';

function createRecordingEntry(id = 'recording-1') {
  return {
    assetId: `asset-${id}`,
    id,
    mimeType: 'video/webm',
    filename: `${id}.webm`,
    createdAt: 1000,
    size: 5,
  };
}

function withLegacyLifecycle(entry: ReturnType<typeof createRecordingEntry>) {
  return {
    ...entry,
    lifecycle: { savedAt: entry.createdAt, storageClass: 'library', updatedAt: entry.createdAt },
  };
}

describe('recording entry guards', () => {
  it('accepts valid recording entries and rejects invalid payloads', () => {
    const entry = createRecordingEntry();

    expect(parseRecordingEntry(entry)).toEqual(withLegacyLifecycle(entry));
    expect(parseRecordingEntry({ ...entry, size: '5' })).toBeNull();
    expect(parseRecordingEntry({ ...entry, assetId: '' })).toBeNull();
  });

  it('filters invalid entries from stored lists and reports invalid roots', () => {
    expect(parseRecordingEntries({ broken: true })).toEqual({
      entries: [],
      hasInvalidRoot: true,
      invalidEntryCount: 0,
    });

    expect(parseRecordingEntries([createRecordingEntry(), { broken: true }])).toEqual({
      entries: [withLegacyLifecycle(createRecordingEntry())],
      hasInvalidRoot: false,
      invalidEntryCount: 1,
    });
  });
});
