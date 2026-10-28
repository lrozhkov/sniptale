import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  readAssetFile: mocks.readFile,
}));

import type {
  MediaLibraryEntry,
  MediaLibraryItem,
} from '../../../../composition/persistence/media-library/contracts';
import { createQuickEditAdvancedState } from '../../../../features/video/review/advanced/defaults';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { parsePortableMediaMetadata } from '../root-codecs/media';
import { createMediaHubBackupExportOptions } from '../options';
import { buildMediaRootInventory } from './media';
import { parseVideoWorkspace } from '../../../../composition/persistence/review-workspaces/parser';
import { prepareVideoReviewRestore } from '../../../../composition/persistence/review-workspaces/backup-restore';
import { nestedMediaReviewFixture } from '../root-publication/media.review-assets.test-support';
import { buildProjectAssetMediaEntry } from '../../../../composition/persistence/media-library/entry-mapping';

const assets = new Map([
  [
    'background',
    {
      id: 'background',
      assetId: 'background-bytes',
      mimeType: 'image/png',
      createdAt: 1,
      size: 10,
    },
  ],
  [
    'music',
    { id: 'music', assetId: 'music-bytes', mimeType: 'audio/mpeg', createdAt: 1, size: 11 },
  ],
  [
    'voice',
    { id: 'voice', assetId: 'voice-bytes', mimeType: 'audio/mpeg', createdAt: 1, size: 12 },
  ],
]);

function review(aggregateId: string) {
  const advanced = {
    ...createQuickEditAdvancedState(),
    background: {
      enabled: true as const,
      type: 'image' as const,
      assetId: 'project-asset:background',
      imageFit: 'cover' as const,
      layout: { padding: 0, cornerRadius: 0 },
    },
    audio: {
      original: { muted: false, volume: 1 },
      voiceover: [],
      music: [clip('music', 'project-asset:music', 0, 2)],
    },
  };
  const before = {
    schemaVersion: advanced.schemaVersion,
    zoom: advanced.zoom,
    background: advanced.background,
    audio: advanced.audio,
  };
  const after = {
    ...before,
    audio: { ...before.audio, voiceover: [clip('voice', 'project-asset:voice', 1, 1)] },
  };
  return {
    aggregateId,
    formatVersion: 1,
    sourceAssetId: 'video-object',
    source: { duration: 4, width: 100, height: 80, size: 6, mimeType: 'video/webm' },
    revision: 1,
    cursor: 1,
    history: [{ id: 'advanced', at: 1, target: 'advancedContent', before, after }],
    advanced,
    createdAt: 1,
    updatedAt: 1,
  };
}

function clip(id: string, assetId: string, timelineStart: number, duration: number) {
  return {
    id,
    assetId,
    timelineStart,
    sourceOffset: 0,
    duration,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}

function mediaEntry(sourceKind: 'recording' | 'project-video'): MediaLibraryEntry {
  return {
    createdAt: 1,
    duration: 4,
    filename: 'result.webm',
    height: 80,
    id: sourceKind === 'recording' ? 'recording:selected' : 'export:selected',
    kind: sourceKind === 'recording' ? 'recording' : 'export',
    mimeType: 'video/webm',
    originalFilename: 'result.webm',
    size: 6,
    source:
      sourceKind === 'recording'
        ? { kind: 'recording', recordingId: 'selected' }
        : { kind: 'project-export', exportId: 'selected', projectId: 'not-selected' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 100,
  };
}

function database(entry: MediaLibraryEntry, project = false, override?: unknown, draft?: unknown) {
  const workspace = {
    ...review(entry.id),
    ...(project
      ? {
          formatVersion: 3,
          project: {
            name: 'Renamed edit',
            lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
          },
        }
      : {}),
  };
  return {
    transaction: vi.fn(() => ({
      objectStore: (store: string) => ({
        index: () => ({ getAll: async () => [] }),
        get: async () =>
          store === 'video_workspaces'
            ? override === undefined
              ? workspace
              : override
            : store === 'video_workspace_drafts'
              ? draft
              : undefined,
      }),
      done: Promise.resolve(),
    })),
    get: vi.fn(async (store: string, key: unknown) => {
      if (store === 'media_library') return mediaRow(entry, String(key));
      if (store === 'recordings') return sourceRow('recording');
      if (store === 'project_exports') return sourceRow('project-video');
      if (store === 'project_assets') return assets.get(String(key));
      if (store === 'asset_refs') return assetRef(String(key));
      return undefined;
    }),
  };
}

function mediaRow(entry: MediaLibraryEntry, key: string) {
  if (key === entry.id) return entry;
  const id = key.slice('project-asset:'.length);
  return assets.has(id) ? { ...entry, id: key, filename: `${id}.bin` } : undefined;
}

function sourceRow(kind: 'recording' | 'project-video') {
  return kind === 'recording'
    ? {
        id: 'selected',
        assetId: 'video-object',
        filename: 'result.webm',
        createdAt: 1,
        mimeType: 'video/webm',
        size: 6,
      }
    : {
        id: 'selected',
        projectId: 'not-selected',
        assetId: 'video-object',
        filename: 'result.webm',
        createdAt: 1,
        duration: 4,
        width: 100,
        height: 80,
        fps: 30,
        size: 6,
        mimeType: 'video/webm',
      };
}

function assetRef(assetId: string) {
  const asset = [...assets.values()].find((candidate) => candidate.assetId === assetId);
  const mimeType = asset?.mimeType ?? 'video/webm';
  const size = asset?.size ?? 6;
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType,
    sha256: null,
    size,
  };
}

beforeEach(() => {
  mocks.readFile.mockImplementation(async (ref, filename: string) => {
    const size = (ref as { size: number }).size;
    return new File(['x'.repeat(size)], filename);
  });
});

it.each(['recording', 'project-video'] as const)(
  'archives every project asset referenced by a standalone %s review',
  async (sourceKind) => {
    const entry = mediaEntry(sourceKind);
    const { blob: _blob, ...metadata } = entry;
    const item = { ...metadata, hasThumbnail: false } satisfies MediaLibraryItem;
    const [root] = await buildMediaRootInventory({
      db: database(entry),
      items: [item],
      options: createMediaHubBackupExportOptions({ scope: 'all' }),
      paths: createArchivePathAllocator(),
    });

    const payload = await root!.load();
    const portable = parsePortableMediaMetadata(payload.metadata);
    expect(portable.reviewAssets?.map((asset) => asset.entry.id)).toEqual([
      'background',
      'music',
      'voice',
    ]);
    expect(payload.objects).toHaveLength(4);
  }
);

it('exports selected project metadata and source bytes once through the media inventory', async () => {
  const entry = mediaEntry('recording');
  const { blob: _blob, ...metadata } = entry;
  const roots = await buildMediaRootInventory({
    db: database(entry, true),
    items: [{ ...metadata, hasThumbnail: false }],
    options: createMediaHubBackupExportOptions({
      scope: 'selected',
      selected: {
        mediaAssetIds: [entry.id, entry.id],
        videoProjectIds: [],
        scenarioProjectIds: [],
      },
    }),
    paths: createArchivePathAllocator(),
  });
  expect(roots).toHaveLength(1);
  const payload = await roots[0]!.load();
  const portable = parsePortableMediaMetadata(payload.metadata);
  expect(portable.videoReview).toMatchObject({
    workspace: {
      project: { name: 'Renamed edit', lifecycle: { storageClass: 'library', trashedAt: 3 } },
    },
  });
  expect(payload.objects).toHaveLength(4);
});

it('uses the same recording identity for review admission and original bytes after replacement', async () => {
  const entry = mediaEntry('recording');
  const db = database(entry);
  const get = db.get.getMockImplementation()!;
  let recordingReads = 0;
  db.get.mockImplementation(async (store, key) => {
    if (store === 'recordings') {
      recordingReads++;
      return {
        ...sourceRow('recording'),
        assetId: recordingReads === 1 ? 'video-object' : 'replacement-object',
      };
    }
    return get(store, key);
  });
  const { blob: _blob, ...metadata } = entry;
  await buildMediaRootInventory({
    db,
    items: [{ ...metadata, hasThumbnail: false }],
    options: createMediaHubBackupExportOptions(),
    paths: createArchivePathAllocator(),
  });
  const videoReads = mocks.readFile.mock.calls.filter(([ref]) => ref.mimeType === 'video/webm');
  expect(videoReads.at(-1)?.[0].assetId).toBe('video-object');
});

it('backs up the selected archived quick project and restores its independent source binding', async () => {
  const entry = mediaEntry('recording');
  const archiveId = 'recording:quick-project:previous';
  const workspace = parseVideoWorkspace({
    ...review(archiveId),
    formatVersion: 3,
    sourceMediaId: entry.id,
    project: {
      name: 'Previous quick edit',
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    },
  });
  if (!workspace) throw new Error('Invalid archived fixture');
  const draft = {
    aggregateId: archiveId,
    revision: 1,
    annotation: {
      id: 'recover',
      text: 'Recovery',
      anchor: { kind: 'point' as const, time: 1 },
    },
    before: null,
    updatedAt: 1,
  };
  const { blob: _blob, ...metadata } = entry;
  const db = database(entry, false, workspace, draft);
  const roots = await buildMediaRootInventory({
    db,
    items: [{ ...metadata, hasThumbnail: false }],
    reviewWorkspaceHeads: [workspace],
    options: createMediaHubBackupExportOptions({
      scope: 'selected',
      selected: {
        mediaAssetIds: [archiveId],
        videoProjectIds: [],
        scenarioProjectIds: [],
      },
    }),
    paths: createArchivePathAllocator(),
  });
  expect(roots).toHaveLength(1);
  expect(roots[0]!.descriptor.rootId).toBe(archiveId);
  const portable = parsePortableMediaMetadata((await roots[0]!.load()).metadata);
  expect(portable.videoReview?.workspace).toMatchObject({
    aggregateId: archiveId,
    project: { name: 'Previous quick edit' },
  });
  expect(portable.videoReview?.workspace).not.toHaveProperty('sourceMediaId');
  if (!portable.videoReview) throw new Error('Missing archived review');
  const restored = prepareVideoReviewRestore({
    review: portable.videoReview,
    sourceAggregateId: archiveId,
    targetAggregateId: 'recording:restored',
    sourceAssetId: 'restored-object',
    assetIdMap: new Map(['background', 'music', 'voice'].map((id) => [id, id])),
  });
  expect(restored.workspace.aggregateId).toBe('recording:restored');
  expect(restored.workspace.history).toEqual(workspace.history);
  expect(restored.workspace).not.toHaveProperty('sourceMediaId');
  expect(restored.draft).toEqual({ ...draft, aggregateId: 'recording:restored' });
  expect(db.get.mock.calls.filter(([store]) => store === 'media_library')).not.toContainEqual([
    'media_library',
    archiveId,
  ]);
});

it('does not admit unrelated archived heads for a selected media backup', async () => {
  const db = database(mediaEntry('recording'));
  const roots = await buildMediaRootInventory({
    db,
    items: [],
    reviewWorkspaceHeads: [
      { aggregateId: 'recording:unrelated', sourceMediaId: 'recording:source' },
    ],
    options: createMediaHubBackupExportOptions({
      scope: 'selected',
      selected: {
        mediaAssetIds: ['recording:selected'],
        videoProjectIds: [],
        scenarioProjectIds: [],
      },
    }),
    paths: createArchivePathAllocator(),
  });
  expect(roots).toEqual([]);
  expect(db.transaction).not.toHaveBeenCalled();
});

it('refuses a selected archived project that disappears before source admission', async () => {
  await expect(
    buildMediaRootInventory({
      db: database(mediaEntry('recording'), false, null),
      items: [],
      reviewWorkspaceHeads: [
        { aggregateId: 'recording:quick-project:missing', sourceMediaId: 'recording:source' },
      ],
      options: createMediaHubBackupExportOptions({
        scope: 'selected',
        selected: {
          mediaAssetIds: ['recording:quick-project:missing'],
          videoProjectIds: [],
          scenarioProjectIds: [],
        },
      }),
      paths: createArchivePathAllocator(),
    })
  ).rejects.toThrow('Quick project changed before backup.');
});

it.each([false, true])(
  'inventories the reachable private video sidecars without repeated reads (cycle=%s)',
  async (cycle) => {
    const { rows } = nestedMediaReviewFixture(cycle);
    const reviews = [rows.review, ...rows.privateReviews];
    const values = new Map<string, Map<string, unknown>>([
      ['media_library', new Map([[rows.source.media.id, rows.source.media]])],
      [
        'project_assets',
        new Map([rows.source.projectAsset, ...rows.assets].map((entry) => [entry.id, entry])),
      ],
      ['asset_refs', new Map([rows.source.ref, ...rows.refs].map((ref) => [ref.assetId, ref]))],
      [
        'video_workspaces',
        new Map(reviews.map((review) => [review.workspace.aggregateId, review.workspace])),
      ],
      [
        'video_workspace_drafts',
        new Map(reviews.map((review) => [review.workspace.aggregateId, review.draft ?? undefined])),
      ],
    ]);
    const get = vi.fn(async (store: string, key: unknown) =>
      typeof key === 'string' ? values.get(store)?.get(key) : undefined
    );
    const roots = await buildMediaRootInventory({
      db: {
        get,
        transaction: () => ({
          done: Promise.resolve(),
          objectStore: (store) => ({
            get: (key) => get(store, key),
            index: () => ({ getAll: async () => [] }),
          }),
        }),
      },
      items: [{ ...rows.source.media, hasThumbnail: false }],
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    });
    const metadata = parsePortableMediaMetadata((await roots[0]!.load()).metadata);
    expect(metadata.reviewAssets?.map((asset) => asset.entry.id)).toEqual(['b', 'c']);
    expect(
      metadata.reviewAssets?.every((asset) => asset.publishToLibrary === false && asset.videoReview)
    ).toBe(true);
    expect(
      get.mock.calls.filter(([store, key]) => store === 'project_assets' && key === 'b')
    ).toHaveLength(1);
    expect(
      get.mock.calls.filter(([store, key]) => store === 'project_assets' && key === 'c')
    ).toHaveLength(1);
    values.get('media_library')!.set('project-asset:b', {
      ...buildProjectAssetMediaEntry(rows.assets[0]!),
      lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 1 },
    });
    get.mockClear();
    const borrowed = await buildMediaRootInventory({
      db: {
        get,
        transaction: () => ({
          done: Promise.resolve(),
          objectStore: (store) => ({
            get: (key) => get(store, key),
            index: () => ({ getAll: async () => [] }),
          }),
        }),
      },
      items: [{ ...rows.source.media, hasThumbnail: false }],
      options: createMediaHubBackupExportOptions(),
      paths: createArchivePathAllocator(),
    });
    const borrowedMetadata = parsePortableMediaMetadata((await borrowed[0]!.load()).metadata);
    expect(borrowedMetadata.reviewAssets).toHaveLength(1);
    expect(borrowedMetadata.reviewAssets?.[0]).toMatchObject({ libraryMediaId: 'project-asset:b' });
    expect(borrowedMetadata.reviewAssets?.[0]).not.toHaveProperty('videoReview');
    expect(
      get.mock.calls.filter(
        ([store, key]) => store === 'video_workspaces' && key === 'project-asset:b'
      )
    ).toHaveLength(0);
  }
);
