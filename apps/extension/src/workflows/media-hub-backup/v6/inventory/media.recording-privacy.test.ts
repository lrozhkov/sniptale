import { expect, it, vi } from 'vitest';

const readFileMock = vi.hoisted(() => vi.fn());
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: readFileMock,
}));

import type {
  MediaLibraryEntry,
  MediaLibraryItem,
} from '../../../../composition/persistence/media-library/contracts';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { buildMediaRootInventory } from './media';
import { createMediaHubBackupExportOptions } from '../options';

const recordingGroup = {
  dimensions: { height: 720, width: 1280 },
  groupId: 'recording-one',
  order: 0,
  role: 'display' as const,
  sourceFavicon: 'javascript:alert(1)',
  sourceLabel: 'Private tab title',
  sourceUrl: 'https://example.com/private',
};

function createRecordingEntry(): MediaLibraryEntry {
  return {
    createdAt: 1,
    duration: 3,
    filename: 'recording.webm',
    height: 720,
    id: 'recording-media',
    kind: 'recording',
    mimeType: 'video/webm',
    originalFilename: 'recording.webm',
    recordingGroup,
    size: 5,
    source: { kind: 'recording', recordingId: 'recording-one' },
    sourceFavicon: recordingGroup.sourceFavicon,
    sourceTitle: recordingGroup.sourceLabel,
    sourceUrl: recordingGroup.sourceUrl,
    tags: [],
    updatedAt: 1,
    width: 1280,
  };
}

function createDatabase(entry: MediaLibraryEntry) {
  return {
    get: vi.fn(async (store: string) => {
      if (store === 'media_library') return entry;
      if (store === 'recordings') {
        return {
          assetId: 'recording-asset',
          createdAt: 1,
          filename: 'recording.webm',
          id: 'recording-one',
          mimeType: 'video/webm',
          recordingGroup,
          size: 5,
        };
      }
      if (store === 'asset_refs') {
        return {
          assetId: 'recording-asset',
          createdAt: 1,
          location: { kind: 'opfs', objectKey: 'objects/recording-asset' },
          mimeType: 'video/webm',
          sha256: null,
          size: 5,
        };
      }
      return undefined;
    }),
  };
}

async function loadRecordingMetadata(includeSourceMetadata: boolean) {
  const entry = createRecordingEntry();
  const { blob: _blob, ...metadata } = entry;
  readFileMock.mockResolvedValue(new File(['media'], 'recording.webm', { type: 'video/webm' }));
  const [root] = await buildMediaRootInventory({
    db: createDatabase(entry),
    items: [{ ...metadata, hasThumbnail: false } satisfies MediaLibraryItem],
    options: createMediaHubBackupExportOptions({ includeSourceMetadata }),
    paths: createArchivePathAllocator(),
  });
  return { metadata: (await root!.load()).metadata, summary: root!.summary };
}

it('projects nested recording source metadata in both exported metadata copies', async () => {
  const excluded = await loadRecordingMetadata(false);
  expect(excluded.metadata).toMatchObject({
    entry: { recordingGroup: { sourceFavicon: null, sourceLabel: null, sourceUrl: null } },
    recording: {
      entry: { recordingGroup: { sourceFavicon: null, sourceLabel: null, sourceUrl: null } },
    },
  });
  expect(excluded.summary.sourceMetadataCount).toBe(0);

  const included = await loadRecordingMetadata(true);
  expect(included.metadata).toMatchObject({
    entry: {
      recordingGroup: {
        sourceFavicon: null,
        sourceLabel: 'Private tab title',
        sourceUrl: 'https://example.com/private',
      },
    },
    recording: {
      entry: {
        recordingGroup: {
          sourceFavicon: null,
          sourceLabel: 'Private tab title',
          sourceUrl: 'https://example.com/private',
        },
      },
    },
  });
});
