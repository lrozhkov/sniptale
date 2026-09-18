import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../../../composition/persistence/projects/index.test-support';

const mocks = vi.hoisted(() => ({ readInventoryAssetFile: vi.fn() }));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  readInventoryAssetFile: mocks.readInventoryAssetFile,
}));

import type { ArchivePathAllocator } from '../../../../composition/archive-transfer';
import {
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { assertPortableJson } from '../codec';
import { parsePortableVideoProjectMetadata } from '../root-codecs/projects';
import { createMediaHubBackupExportOptions } from '../options';
import { buildVideoProjectRootInventory } from './video-projects';

function assetEntry(id: string, assetId: string, mimeType: string, size: number) {
  return { id, assetId, mimeType, createdAt: 1, size };
}

function ref(assetId: string, mimeType: string, size: number) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType,
    sha256: null,
    size,
  };
}

function database(
  projectAssetEntries: unknown[],
  mediaEntries: Map<string, unknown>,
  projectRows: unknown[] = [],
  workspaceRows: unknown[] = []
) {
  const rows = new Map<string, unknown[]>([
    [PROJECT_ASSETS_STORE, projectAssetEntries],
    [VIDEO_WORKSPACES_STORE, workspaceRows],
  ]);
  return {
    get: async (store: string, key: unknown) => {
      if (store === MEDIA_LIBRARY_STORE) return mediaEntries.get(String(key));
      if (store === 'asset_refs') return ref(String(key), 'audio/mpeg', 8);
      if (store === VIDEO_WORKSPACES_STORE || store === VIDEO_WORKSPACE_DRAFTS_STORE)
        return rows.get(store)?.find((row) => (row as { aggregateId: string }).aggregateId === key);
      return projectAssetEntries.find((entry) => (entry as { id: string }).id === key);
    },
    getAll: async (store: string) => (store === VIDEO_PROJECTS_STORE ? projectRows : []),
    getAllFromIndex: async () => [],
    transaction: (_stores: string[]) => ({
      objectStore: (name: string) => ({
        get: async (key: string) =>
          rows.get(name)?.find((row) => (row as { aggregateId: string }).aggregateId === key),
      }),
      done: Promise.resolve(),
    }),
  };
}

const paths = {
  reserve: (segments: string[]) => segments.join('/'),
} as unknown as ArchivePathAllocator;

const REVIEW_AGGREGATE = 'project-asset:project-asset-1';

const workspaceRow = {
  aggregateId: REVIEW_AGGREGATE,
  formatVersion: 1,
  source: { duration: 4, width: 640, height: 360, size: 10, mimeType: 'video/webm' },
  revision: 2,
  cursor: 0,
  history: [],
  createdAt: 1,
  updatedAt: 2,
  sourceAssetId: 'local-video',
  advanced: {
    schemaVersion: 2,
    ui: { mode: 'advanced', tracks: { actions: true, zoom: false, audio: true } },
    zoom: { enabled: false, regions: [] },
    background: { enabled: false },
    audio: {
      original: { muted: false, volume: 1 },
      voiceover: [],
      music: [
        {
          id: 'm',
          assetId: 'project-asset:music',
          timelineStart: 0,
          sourceOffset: 0,
          duration: 2,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readInventoryAssetFile.mockImplementation(
    async (_db: unknown, _assetId: string, filename: string) => new Blob([filename])
  );
});

describe('video project backup inventory', () => {
  it('archives review-referenced external audio assets with portable-safe metadata', async () => {
    const entry = createVideoProjectEntryWithMediaClip();
    const db = database(
      [
        assetEntry('project-asset-1', 'local-video', 'video/webm', 10),
        assetEntry('music', 'local-music', 'audio/mpeg', 8),
      ],
      new Map([
        ['project-asset:project-asset-1', createMediaLibraryEntry({ filename: 'take.webm' })],
        ['project-asset:music', createMediaLibraryEntry({ filename: 'theme.mp3' })],
      ]),
      [entry],
      [workspaceRow]
    );
    const roots = await buildVideoProjectRootInventory({
      db,
      options: createMediaHubBackupExportOptions({ includeDrafts: true, scope: 'all' }),
      paths,
    });
    expect(roots).toHaveLength(1);
    const payload = await roots[0]!.load();
    expect(() => assertPortableJson(payload.metadata)).not.toThrow();
    const metadata = parsePortableVideoProjectMetadata(payload.metadata);
    const assets = metadata.projectAssets.map((asset) => ({
      id: asset.entry.id,
      filename: asset.filename,
    }));
    expect(assets).toEqual([
      { id: 'project-asset-1', filename: 'take.webm' },
      { id: 'music', filename: 'theme.mp3' },
    ]);
    expect(roots[0]!.descriptor.objectCount).toBe(2);
  });

  it('skips stale review references instead of failing the backup', async () => {
    const entry = createVideoProjectEntryWithMediaClip();
    // The review references project-asset:music but that store row is gone.
    const db = database(
      [assetEntry('project-asset-1', 'local-video', 'video/webm', 10)],
      new Map([
        ['project-asset:project-asset-1', createMediaLibraryEntry({ filename: 'take.webm' })],
      ]),
      [entry],
      [workspaceRow]
    );
    const roots = await buildVideoProjectRootInventory({
      db,
      options: createMediaHubBackupExportOptions({ includeDrafts: true, scope: 'all' }),
      paths,
    });
    const metadata = parsePortableVideoProjectMetadata((await roots[0]!.load()).metadata);
    expect(metadata.projectAssets.map((asset) => asset.entry.id)).toEqual(['project-asset-1']);
  });
});
