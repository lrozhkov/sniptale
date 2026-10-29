import { vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProjectEntryWithMediaClip,
  createVideoProjectRestoreTransaction,
} from '../../projects/index.test-support';
import type { AssetRef } from '../../assets/contracts';

export function memoryStore() {
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

export function reference(assetId: string, mimeType: string, size: number): AssetRef {
  return {
    assetId,
    createdAt: 10,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType,
    size,
    sha256: null,
  };
}

export function createProjectFreezeFixture() {
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
    kind: 'video',
    mimeType: 'video/webm',
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
