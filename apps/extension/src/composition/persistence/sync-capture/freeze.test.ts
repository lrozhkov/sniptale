import { expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
  createVideoProjectRestoreTransaction,
} from '../projects/index.test-support';
import type { AssetRef } from '../assets/contracts';
import { freezeVideoProjectInTransaction, UnsupportedSyncCaptureGraphError } from './freeze';

function memoryStore() {
  const rows = new Map<string, unknown>();
  const key = (value: IDBValidKey) => JSON.stringify(value);
  return {
    rows,
    seed(id: IDBValidKey, value: unknown) {
      rows.set(key(id), value);
    },
    get: vi.fn(async (id: IDBValidKey) => rows.get(key(id))),
    getAll: vi.fn(async () => {
      throw new Error('Global enumeration is outside the freezer contract.');
    }),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    index: vi.fn((name: string) => ({
      getAll: vi.fn(async (id: IDBValidKey, count?: number) =>
        [...rows.values()]
          .filter(
            (row) =>
              typeof row === 'object' &&
              row !== null &&
              name in row &&
              Reflect.get(row, name) === id
          )
          .slice(0, count)
      ),
      getAllKeys: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    })),
  };
}

function reference(assetId: string, mimeType: string, size: number): AssetRef {
  return {
    assetId,
    createdAt: 10,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType,
    size,
    sha256: null,
  };
}

function fixture() {
  const stores = {
    assets: memoryStore(),
    exports: memoryStore(),
    media: memoryStore(),
    videoWorkspaces: memoryStore(),
    videoDrafts: memoryStore(),
    operations: memoryStore(),
    owners: memoryStore(),
    presentations: memoryStore(),
    projects: memoryStore(),
    refs: memoryStore(),
    thumbnails: memoryStore(),
    scenarioAssets: memoryStore(),
  };
  const project = createVideoProjectEntryWithMediaClip();
  const source = project.project.assets[0]!;
  if (source.source.kind !== 'project-asset')
    throw new Error('Fixture source must be a project asset.');
  const asset = createProjectAssetEntry({
    id: source.source.projectAssetId,
    originMediaId: 'original-1',
    mimeType: source.metadata.mimeType,
    size: source.metadata.size,
  });
  const exported = createProjectExportEntry({ projectId: project.id });
  const mirror = createMediaLibraryEntry({
    id: `project-asset:${asset.id}`,
    kind: 'video',
    source: { kind: 'project-asset', projectAssetId: asset.id },
    mimeType: asset.mimeType,
    size: asset.size,
  });
  const original = createMediaLibraryEntry({
    id: 'original-1',
    source: { kind: 'stored-asset', assetId: 'original-bytes' },
    size: 7,
  });
  const exportMirror = createMediaLibraryEntry({
    id: `export:${exported.id}`,
    kind: 'export',
    source: { kind: 'project-export', exportId: exported.id, projectId: project.id },
    mimeType: exported.mimeType!,
    size: exported.size,
  });
  stores.projects.seed(project.id, project);
  stores.assets.seed(asset.id, asset);
  stores.exports.seed(exported.id, exported);
  for (const row of [mirror, original, exportMirror]) stores.media.seed(row.id, row);
  for (const ref of [
    reference(asset.assetId, asset.mimeType, asset.size),
    reference(exported.assetId, exported.mimeType!, exported.size),
    reference('original-bytes', original.mimeType, original.size),
  ])
    stores.refs.seed(ref.assetId, ref);
  const tx = createVideoProjectRestoreTransaction(stores);
  return { stores, project, asset, exported, mirror, original, exportMirror, tx };
}

it('freezes exact native rows and the origin media dependency without reading another database', async () => {
  const data = fixture();
  const rawProject = { ...data.project, usageReferenceKeys: ['owner-index-value'] };
  data.stores.projects.seed(data.project.id, rawProject);
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(rows.project).toEqual(rawProject);
  expect(rows.assets).toEqual([data.asset]);
  expect(rows.exports).toEqual([data.exported]);
  expect(rows.media).toEqual(
    expect.arrayContaining([data.mirror, data.original, data.exportMirror])
  );
  expect(rows.media).toHaveLength(3);
  expect(new Set(rows.refs.map((row) => row.assetId))).toEqual(
    new Set(['asset-object-1', 'export-object-1', 'original-bytes'])
  );
  rawProject.project.name = 'Changed after capture';
  data.asset.originMediaId = 'replacement';
  expect(rows.project.project.name).not.toBe(rawProject.project.name);
  expect(rows.assets[0]?.originMediaId).toBe('original-1');
  for (const store of Object.values(data.stores)) {
    expect(store.getAll).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  }
});

it('captures a borrowed stored media source and its physical ref once', async () => {
  const data = fixture();
  const source = data.project.project.assets[0]!;
  const borrowed = {
    ...source,
    type: 'IMAGE' as const,
    id: 'borrowed-placement',
    source: { kind: 'library-asset' as const, mediaId: data.original.id },
    metadata: { ...source.metadata, mimeType: data.original.mimeType, size: data.original.size },
  };
  data.project.project.assets.push(borrowed);
  const rows = await freezeVideoProjectInTransaction(data.tx, data.project.id);
  expect(rows.project.project.assets).toHaveLength(2);
  expect(rows.media.filter((row) => row.id === data.original.id)).toHaveLength(1);
  expect(rows.refs.filter((row) => row.assetId === 'original-bytes')).toHaveLength(1);
});

it('refuses a missing dependency rather than dropping it from the snapshot', async () => {
  const data = fixture();
  data.stores.media.rows.delete(JSON.stringify(data.original.id));
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses source descriptor and physical ref disagreements', async () => {
  const data = fixture();
  data.stores.refs.seed(
    data.asset.assetId,
    reference(data.asset.assetId, data.asset.mimeType, data.asset.size + 1)
  );
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses a mismatched published mirror instead of silently changing backup metadata', async () => {
  const data = fixture();
  data.stores.media.seed(data.mirror.id, {
    ...data.mirror,
    source: { kind: 'stored-asset', assetId: 'original-bytes' },
  });
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it.each(['review', 'draft', 'thumbnail', 'presentation'] as const)(
  'refuses an unsupported %s sidecar in the captured graph',
  async (kind) => {
    const data = fixture();
    if (kind === 'review')
      data.stores.videoWorkspaces.seed(data.mirror.id, { aggregateId: data.mirror.id });
    if (kind === 'draft')
      data.stores.videoDrafts.seed(data.mirror.id, { aggregateId: data.mirror.id });
    if (kind === 'thumbnail')
      data.stores.thumbnails.seed(`video-project:${data.project.id}`, {
        blob: new Blob(['thumbnail']),
      });
    if (kind === 'presentation')
      data.stores.presentations.seed(['video-project', data.project.id], {
        aggregateId: data.project.id,
      });
    await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
      UnsupportedSyncCaptureGraphError
    );
  }
);

it('refuses orphan review history even when its workspace head is absent', async () => {
  const data = fixture();
  const tx = new Proxy(data.tx, {
    get(target, property) {
      if (property !== 'objectStore') return Reflect.get(target, property);
      return (name: string) =>
        name === 'video_workspace_history'
          ? { index: () => ({ getAllKeys: async () => ['orphan-history'] }) }
          : target.objectStore(name);
    },
  });
  await expect(freezeVideoProjectInTransaction(tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses a recording graph before looking up its unsupported dependency stores', async () => {
  const data = fixture();
  data.project.project.source = { kind: 'recording', recordingId: 'recording-1' };
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
  expect(data.stores.assets.get).not.toHaveBeenCalled();
});

it('refuses a malformed saved export rather than omitting it as ordinary backup listing can', async () => {
  const data = fixture();
  data.stores.exports.seed('malformed', { id: 'malformed', projectId: data.project.id });
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('refuses legacy inline media bytes in an otherwise supported graph', async () => {
  const data = fixture();
  data.stores.media.seed(data.original.id, { ...data.original, blob: new Blob(['private bytes']) });
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).rejects.toBeInstanceOf(
    UnsupportedSyncCaptureGraphError
  );
});

it('does not inspect unrelated roots or sidecars', async () => {
  const data = fixture();
  data.stores.projects.seed('unrelated', { unsupported: true });
  data.stores.videoWorkspaces.seed('unrelated', { unsupported: true });
  data.stores.media.seed('unrelated', { blob: new Blob(['unrelated']) });
  await expect(freezeVideoProjectInTransaction(data.tx, data.project.id)).resolves.toHaveProperty(
    'project.id',
    data.project.id
  );
});
