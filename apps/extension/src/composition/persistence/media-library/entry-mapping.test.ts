import { expect, it } from 'vitest';

import {
  buildProjectAssetMediaEntry,
  buildRecordingMediaEntry,
  mergeMediaEntry,
} from './entry-mapping';
import type { MediaLibraryEntry } from './contracts';
import type { ProjectAssetEntry } from '../projects/contracts';
import type { StoredRecordingEntry } from '../recordings/contracts';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';

function createRecording(type: string): StoredRecordingEntry {
  return {
    assetId: 'asset-1',
    createdAt: 10,
    filename: type.startsWith('audio/') ? 'microphone.webm' : 'recording.webm',
    id: type.startsWith('audio/') ? 'mic-1' : 'video-1',
    mimeType: type,
    size: 4,
  };
}

function createProjectAsset(type: string): ProjectAssetEntry {
  return {
    assetId: `asset-${type}`,
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

it('projects recording group membership into the media library entry', () => {
  const recordingGroup = {
    dimensions: { height: 1080, width: 1920 },
    groupId: 'capture-1',
    order: 1,
    role: 'webcam' as const,
    sourceFavicon: 'https://user:secret@example.com/favicon.ico?token=secret',
    sourceLabel: 'Example page',
    sourceUrl: 'https://user:secret@example.com/article?token=secret',
  };
  expect(buildRecordingMediaEntry({ ...createRecording('video/webm'), recordingGroup })).toEqual(
    expect.objectContaining({
      height: 1080,
      recordingGroup,
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceTitle: 'Example page',
      sourceUrl: 'https://example.com/article',
      width: 1920,
    })
  );
});

it('projects imported video metadata into a standalone video library entry', () => {
  const mediaMetadata = { duration: 12.5, height: 1080, kind: 'video' as const, width: 1920 };

  expect(buildRecordingMediaEntry({ ...createRecording('video/mp4'), mediaMetadata })).toEqual(
    expect.objectContaining({ duration: 12.5, height: 1080, kind: 'video', width: 1920 })
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
    lifecycle: createLibraryLifecycle('library', 5),
  });
  const merged = mergeMediaEntry(
    existing,
    createMediaEntry({
      filename: 'fresh.webm',
      lifecycle: createLibraryLifecycle('temporary', 10),
    })
  );

  expect(merged.filename).toBe('renamed.webm');
  expect(merged.sourceTitle).toBe('Existing title');
  expect(merged.tags).toEqual(['keep']);
  expect(merged.lifecycle).toEqual(createLibraryLifecycle('library', 5));
});
