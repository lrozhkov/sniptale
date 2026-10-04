import { expect, it, vi } from 'vitest';
import { assertNewProjectSources } from './new-reference-admission';
import {
  createProjectAssetEntry,
  createMediaLibraryEntry,
  createVideoProject,
} from './index.test-support';
import { VideoProjectAssetType } from '../../../features/video/project/types';

type Stores = Parameters<typeof assertNewProjectSources>[2];
function fixture(origin?: string) {
  const asset = createProjectAssetEntry({
    id: 'copy',
    ...(origin ? { originMediaId: origin } : {}),
  });
  const project = createVideoProject({
    assets: [
      {
        id: 'placement',
        type: VideoProjectAssetType.VIDEO,
        name: 'clip',
        createdAt: 1,
        source: { kind: 'project-asset', projectAssetId: asset.id },
        metadata: {
          width: 100,
          height: 100,
          duration: 2,
          mimeType: 'video/webm',
          size: 20,
          hasAudio: false,
          audioPeaks: null,
        },
      },
    ],
  });
  const get = vi.fn(async (id: string): Promise<unknown> => (id === asset.id ? asset : undefined));
  const stores = {
    projectAssetStore: { get },
    mediaLibraryStore: { get },
    recordingStore: { get },
    scenarioAssetStore: { get },
    scenarioProjectStore: { get },
  } as unknown as Stores;
  return { asset, get, project, stores };
}
it('admits independent new resources and reads each unique locator once', async () => {
  const { project, get, stores } = fixture();
  await expect(
    assertNewProjectSources(
      { ...project, assets: [...project.assets, ...project.assets] },
      undefined,
      stores
    )
  ).resolves.toBeUndefined();
  expect(get).toHaveBeenCalledTimes(1);
});
it.each([undefined, { id: 'root' }])(
  'refuses a private row whose original identity is missing or invalid: %j',
  async (raw) => {
    const { asset, project, get, stores } = fixture('root');
    get.mockImplementation(async (id) => (id === asset.id ? asset : raw));
    await expect(assertNewProjectSources(project, undefined, stores)).rejects.toThrow(
      'source is unavailable'
    );
  }
);
it('admits a private acquisition only while its original Library identity exists', async () => {
  const { asset, project, get, stores } = fixture('root');
  get.mockImplementation(async (id) =>
    id === asset.id ? asset : createMediaLibraryEntry({ id: 'root' })
  );
  await expect(assertNewProjectSources(project, undefined, stores)).resolves.toBeUndefined();
});
it('does not block unrelated edits because of unchanged missing legacy sources', async () => {
  const { project, get, stores } = fixture('gone');
  get.mockResolvedValue(undefined);
  await expect(
    assertNewProjectSources({ ...project, name: 'Renamed' }, project, stores)
  ).resolves.toBeUndefined();
  expect(get).not.toHaveBeenCalled();
});
it('rejects restoring a deleted locator after it has been removed from the persisted project', async () => {
  const { project, get, stores } = fixture();
  get.mockResolvedValue(undefined);
  await expect(
    assertNewProjectSources(project, { ...project, assets: [] }, stores)
  ).rejects.toThrow();
});

it.each(['library-asset', 'recording', 'scenario-asset'] as const)(
  'admits new %s locators only through their source owner',
  async (kind) => {
    const { project, get, stores } = fixture();
    const source =
      kind === 'library-asset'
        ? { kind, mediaId: 'source' }
        : kind === 'recording'
          ? { kind, recordingId: 'source' }
          : { kind, scenarioAssetId: 'source' };
    const candidate = { ...project, assets: [{ ...project.assets[0]!, source }] };
    await expect(assertNewProjectSources(candidate, undefined, stores)).rejects.toThrow();
    get.mockResolvedValue(
      kind === 'library-asset'
        ? createMediaLibraryEntry({ id: 'source' })
        : kind === 'recording'
          ? {
              id: 'source',
              assetId: 'bytes',
              filename: 'clip',
              mimeType: 'video/webm',
              size: 1,
              createdAt: 1,
            }
          : {
              id: 'source',
              projectId: 'scenario',
              assetId: 'bytes',
              galleryAssetId: null,
              mimeType: 'image/png',
              width: 1,
              height: 1,
              size: 1,
              createdAt: 1,
            }
    );
    await expect(assertNewProjectSources(candidate, undefined, stores)).resolves.toBeUndefined();
  }
);
it('admits a new scenario origin through its aggregate owner', async () => {
  const { createGuideProject } = await import('../../../features/scenario/project/factories');
  const { createScenarioProjectEntry } = await import('../scenario/projects/entry');
  const { project, stores, get } = fixture();
  const scenario = createGuideProject('Scenario');
  get.mockResolvedValue(createScenarioProjectEntry({ project: scenario, existing: undefined }));
  await expect(
    assertNewProjectSources(
      { ...project, assets: [], source: { kind: 'scenario', scenarioProjectId: scenario.id } },
      undefined,
      stores
    )
  ).resolves.toBeUndefined();
});

it('promotes the canonical mirror of an accepted project asset', async () => {
  const { promoteProjectSourceLifecycles } = await import('./new-reference-admission');
  const { asset, project, stores } = fixture();
  const media = createMediaLibraryEntry({
    id: `project-asset:${asset.id}`,
    source: { kind: 'project-asset', projectAssetId: asset.id },
    lifecycle: { storageClass: 'temporary', savedAt: null, updatedAt: 1 },
  });
  const put = vi.fn();
  stores.mediaLibraryStore = {
    get: vi.fn(async () => media),
    put,
  } as unknown as Stores['mediaLibraryStore'];
  await promoteProjectSourceLifecycles(project, stores, 50);
  expect(put).toHaveBeenCalledWith({
    ...media,
    workspaceRevision: 0,
    lifecycle: { storageClass: 'library', savedAt: 50, updatedAt: 50 },
  });
});
