import { describe, expect, it } from 'vitest';

import { parseRecordingEntries, parseRecordingEntry } from './index.guards.ts';

function createRecordingEntry(id = 'recording-1') {
  return {
    id,
    blob: new Blob(['video'], { type: 'video/webm' }),
    filename: `${id}.webm`,
    createdAt: 1000,
    size: 5,
  };
}

describe('recording entry guards', () => {
  it('accepts valid recording entries and rejects invalid payloads', () => {
    const entry = createRecordingEntry();

    expect(parseRecordingEntry(entry)).toEqual(entry);
    expect(parseRecordingEntry({ ...entry, size: '5' })).toBeNull();
  });

  it('filters invalid entries from stored lists and reports invalid roots', () => {
    expect(parseRecordingEntries({ broken: true })).toEqual({
      entries: [],
      hasInvalidRoot: true,
      invalidEntryCount: 0,
    });

    expect(parseRecordingEntries([createRecordingEntry(), { broken: true }])).toEqual({
      entries: [createRecordingEntry()],
      hasInvalidRoot: false,
      invalidEntryCount: 1,
    });
  });
});
