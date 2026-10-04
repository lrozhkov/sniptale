import { expect, it, vi } from 'vitest';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
  createMediaLibraryEntry,
  createProjectAssetEntry,
} from '../projects/index.test-support';
import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../features/scenario/project/factories';
import { createLibraryLifecycle } from './contracts';

const runWithIndexedDbMutation = vi.hoisted(() => vi.fn());
vi.mock('../infrastructure/indexed-db/mutation', () => ({ runWithIndexedDbMutation }));

import { repairTemporaryProjectLifecycles } from './project-retention';

function createProjectStores(options: { failScenarioPut?: boolean } = {}) {
  const video = {
    ...createVideoProjectEntry({ id: 'video-1' }),
    lifecycle: createLibraryLifecycle('temporary', 10),
    workspaceRevision: 7,
    retainedField: 'preserve',
  };
  const project = createGuideProject('Scenario');
  const scenario = {
    id: project.id,
    project,
    createdAt: 10,
    updatedAt: 10,
    lifecycle: { ...createLibraryLifecycle('temporary', 10), trashedAt: 20 },
    workspaceRevision: 4,
    history: [],
    retainedField: 'preserve',
  };
  const persisted = new Map([
    ['video_projects', new Map<string, unknown>([[video.id, video]])],
    ['scenario_projects', new Map<string, unknown>([[scenario.id, scenario]])],
    ['media_library', new Map<string, unknown>()],
    ['project_assets', new Map<string, unknown>()],
    ['scenario_assets', new Map<string, unknown>()],
    ['recordings', new Map<string, unknown>()],
  ]);
  const abort = vi.fn();
  runWithIndexedDbMutation.mockImplementation(async (effect) => {
    const pending = new Map([...persisted].map(([name, entries]) => [name, new Map(entries)]));
    const tx = {
      abort,
      get done() {
        return Promise.resolve().then(() => {
          if (abort.mock.calls.length > 0) return;
          for (const [name, entries] of pending) persisted.set(name, entries);
        });
      },
      objectStore: (name: string) => ({
        get: async (id: string) => pending.get(name)?.get(id),
        getAll: async () => [...(pending.get(name)?.values() ?? [])],
        put: async (entry: { id: string }) => {
          if (name === 'scenario_projects' && options.failScenarioPut) {
            throw new Error('scenario write failed');
          }
          pending.get(name)?.set(entry.id, entry);
        },
      }),
    };
    return effect({ transaction: () => tx });
  });
  return { abort, persisted, scenario, video };
}

it('promotes both legacy project roots once without changing documents, revisions, or trash', async () => {
  const { persisted, scenario, video } = createProjectStores();
  expect(await repairTemporaryProjectLifecycles(100)).toBe(2);
  expect(persisted.get('video_projects')?.get(video.id)).toEqual({
    ...video,
    lifecycle: { savedAt: 100, storageClass: 'library', updatedAt: 100 },
  });
  expect(persisted.get('scenario_projects')?.get(scenario.id)).toEqual({
    ...scenario,
    lifecycle: { savedAt: 100, storageClass: 'library', trashedAt: 20, updatedAt: 100 },
  });
  expect(await repairTemporaryProjectLifecycles(200)).toBe(0);
  expect(persisted.get('video_projects')?.get(video.id)).toMatchObject({
    lifecycle: { savedAt: 100, storageClass: 'library', updatedAt: 100 },
  });
});

it('aborts the complete repair when the second project store cannot be written', async () => {
  const { abort, persisted, scenario, video } = createProjectStores({ failScenarioPut: true });
  await expect(repairTemporaryProjectLifecycles(100)).rejects.toThrow('scenario write failed');
  expect(abort).toHaveBeenCalledOnce();
  expect(persisted.get('video_projects')?.get(video.id)).toEqual(video);
  expect(persisted.get('scenario_projects')?.get(scenario.id)).toEqual(scenario);
});

it('repairs used logical sources even when their parent is already permanent', async () => {
  const { persisted } = createProjectStores();
  const video = createVideoProjectEntryWithMediaClip({ id: 'accepted-video' });
  video.lifecycle = createLibraryLifecycle('library', 1);
  const media = createMediaLibraryEntry({
    id: 'origin',
    lifecycle: createLibraryLifecycle('temporary', 1),
  });
  const unrelated = createMediaLibraryEntry({
    id: 'unused',
    lifecycle: createLibraryLifecycle('temporary', 1),
  });
  persisted.get('video_projects')!.set(video.id, video);
  persisted.get('media_library')!.set(media.id, media);
  persisted.get('media_library')!.set(unrelated.id, unrelated);
  persisted.get('project_assets')!.set(
    'project-asset-1',
    createProjectAssetEntry({
      id: 'project-asset-1',
      originMediaId: media.id,
    })
  );
  const mirror = createMediaLibraryEntry({
    id: 'project-asset:project-asset-1',
    source: { kind: 'project-asset', projectAssetId: 'project-asset-1' },
    lifecycle: createLibraryLifecycle('temporary', 1),
  });
  persisted.get('media_library')!.set(mirror.id, mirror);
  await repairTemporaryProjectLifecycles(100);
  expect(persisted.get('media_library')!.get(mirror.id)).toMatchObject({
    lifecycle: { storageClass: 'library', savedAt: 100 },
  });
  expect(persisted.get('media_library')!.get(media.id)).toMatchObject({
    lifecycle: { storageClass: 'library', savedAt: 100 },
  });
  expect(persisted.get('media_library')!.get(unrelated.id)).toEqual(unrelated);
  await repairTemporaryProjectLifecycles(200);
  expect(persisted.get('media_library')!.get(media.id)).toMatchObject({
    lifecycle: { storageClass: 'library', savedAt: 100 },
  });
});

it.each(['current', 'history'] as const)('retains scenario source used in %s', async (location) => {
  const { persisted, scenario } = createProjectStores();
  const step = createGuideStep('Retained');
  step.blocks = [
    createGuideImageBlock({
      id: 'retained-block',
      assetId: 'child',
      width: 10,
      height: 10,
      source: { kind: 'import', filename: 'original.png' },
    }),
  ];
  const usedProject = { ...scenario.project, createdAt: 0, updatedAt: 1, items: [step] };
  persisted.get('scenario_projects')!.set(scenario.id, {
    ...scenario,
    project:
      location === 'current' ? usedProject : { ...scenario.project, createdAt: 0, updatedAt: 2 },
    history: location === 'history' ? [{ revision: 1, savedAt: 1, project: usedProject }] : [],
  });
  persisted.get('scenario_assets')!.set('child', {
    id: 'child',
    projectId: scenario.id,
    assetId: 'bytes',
    galleryAssetId: 'origin',
    width: 10,
    height: 10,
    createdAt: 1,
    size: 1,
    mimeType: 'image/png',
  });
  persisted.get('media_library')!.set(
    'origin',
    createMediaLibraryEntry({
      id: 'origin',
      lifecycle: createLibraryLifecycle('temporary', 1),
    })
  );
  await repairTemporaryProjectLifecycles(100);
  expect(persisted.get('media_library')!.get('origin')).toMatchObject({
    lifecycle: { storageClass: 'library', savedAt: 100 },
  });
});
