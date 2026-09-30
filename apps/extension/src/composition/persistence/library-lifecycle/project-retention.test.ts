import { expect, it, vi } from 'vitest';
import { createVideoProjectEntry } from '../projects/index.test-support';
import { createGuideProject } from '../../../features/scenario/project/factories';
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
