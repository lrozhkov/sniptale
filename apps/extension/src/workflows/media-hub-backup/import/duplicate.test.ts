import { expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import { remapEntryForDuplicate } from './duplicate';

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<Omit<MediaLibraryEntry, 'blob'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 1080,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 123,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}

function createUuid(index: number): `${string}-${string}-${string}-${string}-${string}` {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function verifyScreenshotRemap() {
  expect(remapEntryForDuplicate(createMediaEntry({ kind: 'screenshot' }))).toEqual(
    expect.objectContaining({ id: createUuid(1) })
  );
}

function verifyRecordingRemap() {
  expect(
    remapEntryForDuplicate(
      createMediaEntry(
        { kind: 'recording', recordingId: 'recording-1' },
        { id: 'recording:recording-1', kind: 'video' }
      )
    )
  ).toEqual(
    expect.objectContaining({
      id: `recording:import-${createUuid(2)}`,
      source: {
        kind: 'recording',
        recordingId: `import-${createUuid(2)}`,
      },
    })
  );
}

function verifyProjectExportRemap() {
  expect(
    remapEntryForDuplicate(
      createMediaEntry(
        {
          kind: 'project-export',
          exportId: 'export-1',
          projectId: 'project-1',
          recordingId: 'recording-1',
        },
        { id: 'export:export-1', kind: 'export' }
      )
    )
  ).toEqual(
    expect.objectContaining({
      id: `export:${createUuid(4)}`,
      source: {
        exportId: createUuid(4),
        kind: 'project-export',
        projectId: 'project-1',
        recordingId: `import-${createUuid(3)}`,
      },
    })
  );
}

function verifyProjectAssetRemap() {
  expect(
    remapEntryForDuplicate(
      createMediaEntry(
        { kind: 'project-asset', projectAssetId: 'project-asset-1' },
        { id: 'project-asset:project-asset-1', kind: 'image' }
      )
    )
  ).toEqual(
    expect.objectContaining({
      id: `project-asset:import-${createUuid(5)}`,
      source: {
        kind: 'project-asset',
        projectAssetId: `import-${createUuid(5)}`,
      },
    })
  );
}

function verifyWebSnapshotRemap() {
  expect(
    remapEntryForDuplicate(
      createMediaEntry(
        { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
        { id: 'snapshot-1', kind: 'web-archive' }
      )
    )
  ).toEqual(
    expect.objectContaining({
      id: createUuid(6),
      source: {
        kind: 'web-snapshot',
        snapshotId: createUuid(6),
      },
    })
  );
}

it('remaps duplicate screenshot, recording, project export, project asset and web snapshot entries', () => {
  const randomUUIDSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
  let index = 0;

  randomUUIDSpy.mockImplementation(() => createUuid(++index));

  verifyScreenshotRemap();
  verifyRecordingRemap();
  verifyProjectExportRemap();
  verifyProjectAssetRemap();
  verifyWebSnapshotRemap();
});
