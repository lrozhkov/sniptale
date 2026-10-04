import { expect, it, vi } from 'vitest';
import { deleteProjectAssetsUnreferencedByOtherProjects } from './asset-references';
import { buildPhysicalDeleteOperation } from '../assets';
import { createProjectAssetEntry, createVideoProjectEntry } from './index.test-support';

it.each(['unknown-video', 'scenario', 'review'] as const)(
  'retains a private resource used by an external %s consumer',
  async (kind) => {
    const remove = vi.fn();
    const asset = createProjectAssetEntry({ id: 'private' });
    const args = {
      assetOwnerStore: { delete: remove, index: () => ({ count: async () => 0 }) },
      assetRefStore: { delete: remove },
      mediaLibraryStore: { get: async () => undefined, put: vi.fn(), delete: remove },
      operation: buildPhysicalDeleteOperation([]),
      ownerProjectId: 'owner',
      projectAssetIds: [asset.id],
      projectAssetStore: { get: async () => asset, delete: remove },
      projectStore: {
        getAll: async () =>
          kind === 'unknown-video'
            ? [{ ...createVideoProjectEntry(), project: { version: 999 } }]
            : [],
      },
      scenarioAssetStore: {
        getAll: async () =>
          kind === 'scenario'
            ? [{ id: 'child', assetId: 'bytes', galleryAssetId: 'project-asset:private' }]
            : [],
      },
      videoWorkspaceStore: {
        delete: remove,
        getAll: async () => (kind === 'review' ? [{ aggregateId: 'external', version: 999 }] : []),
      },
      videoDraftStore: { delete: remove },
    };
    const stores: Record<string, unknown> = {
      media_library: args.mediaLibraryStore,
      project_assets: args.projectAssetStore,
      video_projects: args.projectStore,
      scenario_assets: args.scenarioAssetStore,
      video_workspaces: args.videoWorkspaceStore,
    };
    await deleteProjectAssetsUnreferencedByOtherProjects({
      tx: { objectStore: (name: string) => stores[name] } as Parameters<
        typeof deleteProjectAssetsUnreferencedByOtherProjects
      >[0]['tx'],
      operation: args.operation,
      projectAssetIds: args.projectAssetIds,
    });
    expect(remove).not.toHaveBeenCalled();
  }
);

it('reclaims private nested auxiliaries after their parent placement is removed', async () => {
  const { createQuickEditAdvancedState } =
    await import('../../../features/video/review/advanced/defaults');
  const advanced = createQuickEditAdvancedState();
  advanced.audio.music.push({
    id: 'music',
    assetId: 'project-asset:child',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  const tables = new Map<string, Map<string, unknown>>();
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };
  for (const id of ['parent', 'child'])
    table('project_assets').set(id, createProjectAssetEntry({ id, assetId: `${id}-bytes` }));
  table('video_workspaces').set('project-asset:parent', {
    aggregateId: 'project-asset:parent',
    sourceAssetId: 'parent-bytes',
    source: { duration: 2, width: 100, height: 100, size: 5, mimeType: 'video/webm' },
    formatVersion: 1,
    revision: 1,
    history: [],
    cursor: 0,
    advanced,
    createdAt: 1,
    updatedAt: 1,
  });
  const store = (name: string) => ({
    get: async (key: string) => table(name).get(key),
    getAll: async () => [...table(name).values()],
    put: vi.fn(),
    delete: async (key: string) => table(name).delete(key),
    index: () => ({ count: async () => 0 }),
  });
  await deleteProjectAssetsUnreferencedByOtherProjects({
    tx: { objectStore: store } as unknown as Parameters<
      typeof deleteProjectAssetsUnreferencedByOtherProjects
    >[0]['tx'],
    operation: buildPhysicalDeleteOperation([]),
    projectAssetIds: ['parent'],
  });
  expect(table('project_assets').has('parent')).toBe(false);
  expect(table('project_assets').has('child')).toBe(false);
});
