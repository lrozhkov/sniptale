import { expect, it, vi } from 'vitest';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../../composition/archive-transfer/test-support';
import { MEDIA_LIBRARY_STORE } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type {
  MediaLibraryEntry,
  MediaLibraryItem,
} from '../../../../composition/persistence/media-library/contracts';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from '../export';
import { inspectMediaHubBackupV6 } from '../inspect';
import { createMediaHubBackupExportOptions } from '../options';
import { buildMediaRootInventory } from './media';

it('writes a selected screenshot from inventory as an inspectable backup', async () => {
  const entry: MediaLibraryEntry = {
    blob: new Blob(['image'], { type: 'image/png' }),
    createdAt: 1,
    duration: null,
    filename: 'capture.png',
    height: 80,
    id: 'media-one',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'capture.png',
    size: 5,
    source: { kind: 'screenshot' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 2,
    width: 100,
    workspaceRevision: 1,
  };
  const { blob: _blob, ...metadata } = entry;
  const item: MediaLibraryItem = { ...metadata, hasThumbnail: false };
  const db = {
    transaction: () => ({
      objectStore: () => ({ get: async () => undefined }),
      done: Promise.resolve(),
    }),
    get: vi.fn(async (store: string) => (store === MEDIA_LIBRARY_STORE ? entry : undefined)),
  };
  const roots = await buildMediaRootInventory({
    db,
    items: [item],
    options: createMediaHubBackupExportOptions({
      scope: 'selected',
      selected: { mediaAssetIds: [entry.id], scenarioProjectIds: [], videoProjectIds: [] },
    }),
    paths: createArchivePathAllocator(),
  });
  const plan = buildMediaHubBackupExportPlanV6({
    privacy: {
      includeSourceMetadata: false,
      includeTelemetry: false,
      includeWebSnapshots: false,
    },
    roots,
  });
  const output = createArchiveMemorySink();
  await exportMediaHubBackupV6({ plan, sink: output.sink });
  await expect(inspectMediaHubBackupV6(output.blob())).resolves.toMatchObject({
    rootKeys: ['media:library-item:media-one'],
  });
});
