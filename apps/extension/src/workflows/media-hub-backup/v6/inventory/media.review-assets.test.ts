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

function database(entry: MediaLibraryEntry) {
  const workspace = review(entry.id);
  return {
    transaction: () => ({
      objectStore: (store: string) => ({
        get: async () => (store === 'video_workspaces' ? workspace : undefined),
      }),
      done: Promise.resolve(),
    }),
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
