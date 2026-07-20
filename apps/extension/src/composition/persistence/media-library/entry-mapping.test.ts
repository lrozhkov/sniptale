import { expect, it } from 'vitest';

import {
  buildProjectAssetMediaEntry,
  buildRecordingMediaEntry,
  mergeMediaEntry,
} from './entry-mapping';
import type { MediaLibraryEntry } from './contracts';
import type { ProjectAssetEntry } from '../projects/contracts';
import type { RecordingEntry } from '../recordings/contracts';

function createRecording(type: string): RecordingEntry {
  return {
    blob: new Blob(['data'], { type }),
    createdAt: 10,
    filename: type.startsWith('audio/') ? 'microphone.webm' : 'recording.webm',
    id: type.startsWith('audio/') ? 'mic-1' : 'video-1',
    size: 4,
  };
}

function createProjectAsset(type: string): Omit<ProjectAssetEntry, 'blob'> {
  return {
    createdAt: 20,
    id: type,
    mimeType: type,
    size: 5,
  };
}

function createMediaEntry(overrides: Partial<MediaLibraryEntry> = {}): MediaLibraryEntry {
  return {
    createdAt: 1,
    duration: null,
    filename: 'base.webm',
    height: null,
    id: 'recording:base',
    kind: 'recording',
    mimeType: 'video/webm',
    originalFilename: 'base.webm',
    size: 1,
    source: { kind: 'recording', recordingId: 'base' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: null,
    ...overrides,
  };
}

it('classifies recording media entries from the recorded blob MIME', () => {
  expect(buildRecordingMediaEntry(createRecording('video/webm'))).toEqual(
    expect.objectContaining({ kind: 'recording', mimeType: 'video/webm' })
  );
  expect(buildRecordingMediaEntry(createRecording('audio/webm'))).toEqual(
    expect.objectContaining({ kind: 'audio', mimeType: 'audio/webm' })
  );
  expect(buildRecordingMediaEntry({ ...createRecording(''), mimeType: 'audio/webm' })).toEqual(
    expect.objectContaining({ kind: 'audio', mimeType: 'audio/webm' })
  );
});

it('classifies project assets by MIME family', () => {
  expect(buildProjectAssetMediaEntry(createProjectAsset('audio/webm')).kind).toBe('audio');
  expect(buildProjectAssetMediaEntry(createProjectAsset('image/png')).kind).toBe('image');
  expect(buildProjectAssetMediaEntry(createProjectAsset('video/webm')).kind).toBe('video');
});

it('preserves user metadata while merging regenerated media entries', () => {
  const existing = createMediaEntry({
    filename: 'renamed.webm',
    originalFilename: 'base.webm',
    sourceTitle: 'Existing title',
    tags: ['keep'],
  });
  const merged = mergeMediaEntry(existing, createMediaEntry({ filename: 'fresh.webm' }));

  expect(merged.filename).toBe('renamed.webm');
  expect(merged.sourceTitle).toBe('Existing title');
  expect(merged.tags).toEqual(['keep']);
});
