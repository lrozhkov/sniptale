import { describe, expect, it } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import {
  createProjectAssetStoreEntry,
  createProjectExportStoreEntry,
  createRecordingStoreEntry,
  createThumbnailStoreEntry,
} from './builders';
import { VideoExportFormat } from '../../../../features/video/project/types';

function createPrepared(assetId: string, blob: Blob) {
  return {
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType: blob.type || 'video/webm',
      sha256: null,
      size: blob.size,
    },
  };
}

function createEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<Omit<MediaLibraryEntry, 'source'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: 42,
    filename: 'asset.webm',
    height: 1080,
    id: 'asset-1',
    kind: 'video',
    mimeType: 'video/webm',
    originalFilename: 'asset.webm',
    size: 5,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: ['tag'],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}

function assertRecordingStoreEntry(): void {
  const blob = new Blob(['recording-data']);
  const prepared = {
    ref: {
      assetId: 'asset-recording-1',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/asset-recording-1' },
      mimeType: 'video/webm',
      sha256: null,
      size: blob.size,
    },
  };
  const entry = createEntry({
    kind: 'recording',
    recordingId: 'recording-1',
  });

  expect(createRecordingStoreEntry('recording-1', entry, prepared)).toEqual({
    assetId: 'asset-recording-1',
    createdAt: 10,
    filename: 'asset.webm',
    id: 'recording-1',
    mimeType: 'video/webm',
    size: blob.size,
  });
}

function assertProjectExportStoreEntry(): void {
  const blob = new Blob(['mp4-data']);
  const entry = createEntry(
    {
      kind: 'project-export',
      exportId: 'export-1',
      projectId: 'project-1',
    },
    {
      duration: null,
      height: null,
      mimeType: 'video/mp4',
      width: null,
    }
  );

  expect(createProjectExportStoreEntry(entry, createPrepared('asset-export-1', blob))).toEqual({
    assetId: 'asset-export-1',
    createdAt: 10,
    duration: 0,
    filename: 'asset.webm',
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 0,
    id: 'export-1',
    mimeType: 'video/mp4',
    projectId: 'project-1',
    size: blob.size,
    width: 0,
  });
}

function assertProjectExportWebmStoreEntry(): void {
  const blob = new Blob(['webm-data']);
  const entry = createEntry({
    kind: 'project-export',
    exportId: 'export-2',
    projectId: 'project-2',
  });

  expect(
    createProjectExportStoreEntry(entry, createPrepared('asset-export-2', blob))
  ).toMatchObject({
    assetId: 'asset-export-2',
    duration: 42,
    format: VideoExportFormat.WEBM,
    height: 1080,
    id: 'export-2',
    projectId: 'project-2',
    width: 1920,
  });
}

function assertProjectAssetAndThumbnailEntries(): void {
  const assetBlob = new Blob(['asset']);
  const thumbnailBlob = new Blob(['thumb']);
  const entry = createEntry({
    kind: 'project-asset',
    projectAssetId: 'project-asset-1',
  });

  expect(createProjectAssetStoreEntry(entry, createPrepared('asset-project-1', assetBlob))).toEqual(
    {
      assetId: 'asset-project-1',
      createdAt: 10,
      id: 'project-asset-1',
      mimeType: 'video/webm',
      size: assetBlob.size,
    }
  );
  expect(createThumbnailStoreEntry(entry, thumbnailBlob)).toEqual({
    assetId: 'asset-1',
    blob: thumbnailBlob,
    createdAt: 10,
    height: 180,
    updatedAt: 20,
    width: 320,
  });
}

function assertProjectExportSourceGuard(): void {
  expect(() =>
    createProjectExportStoreEntry(
      createEntry({
        kind: 'recording',
        recordingId: 'recording-1',
      }),
      createPrepared('asset-invalid-export', new Blob(['asset']))
    )
  ).toThrowError('Project export record builder requires a project-export media entry.');
}

function assertProjectAssetSourceGuard(): void {
  expect(() =>
    createProjectAssetStoreEntry(
      createEntry({
        kind: 'recording',
        recordingId: 'recording-1',
      }),
      createPrepared('asset-invalid-project', new Blob(['asset']))
    )
  ).toThrowError('Project asset record builder requires a project-asset media entry.');
}

describe('media-hub backup record builders', () => {
  it('creates recording store entries with blob-backed size', assertRecordingStoreEntry);

  it('creates project export store entries with export defaults', assertProjectExportStoreEntry);

  it(
    'creates project export store entries with webm format when mp4 is absent',
    assertProjectExportWebmStoreEntry
  );

  it(
    'creates project asset and thumbnail store entries with stable metadata',
    assertProjectAssetAndThumbnailEntries
  );

  it('rejects non-project-export media entries for export records', assertProjectExportSourceGuard);

  it('rejects non-project-asset media entries for asset records', assertProjectAssetSourceGuard);
});
