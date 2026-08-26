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
    expect(
      parseRecordingEntry({
        ...entry,
        recordingGroup: {
          groupId: 'capture-1',
          order: 0,
          role: 'webcam',
          sourceLabel: null,
        },
      })
    ).toEqual(
      expect.objectContaining({ recordingGroup: expect.objectContaining({ role: 'webcam' }) })
    );
    expect(parseRecordingEntry({ ...entry, size: '5' })).toBeNull();
    expect(parseRecordingEntry({ ...entry, assetId: '' })).toBeNull();
    expect(parseRecordingEntry({ ...entry, recordingGroup: { role: 'camera' } })).toBeNull();
    expect(
      parseRecordingEntry({
        ...entry,
        mediaMetadata: { duration: 12, height: 1080, kind: 'video', width: 1920 },
      })
    ).toEqual(
      expect.objectContaining({
        mediaMetadata: { duration: 12, height: 1080, kind: 'video', width: 1920 },
      })
    );
    expect(
      parseRecordingEntry({
        ...entry,
        mediaMetadata: { duration: -1, height: 1080, kind: 'video', width: 1920 },
      })
    ).toBeNull();
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
