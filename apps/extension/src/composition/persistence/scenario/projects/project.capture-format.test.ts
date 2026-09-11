import { expect, it, vi } from 'vitest';

const { readProjectRow } = vi.hoisted(() => ({ readProjectRow: vi.fn() }));

vi.mock('../../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/indexed-db/core')>()),
  initDB: async () => ({ get: readProjectRow }),
}));

vi.mock('../aggregate-mutations', () => ({
  commitScenarioAggregateMutation: vi.fn(),
  recoverScenarioAssetPublications: async () => 0,
}));

import { createGuideProject } from '../../../../features/scenario/project/public';
import { parseScenarioProjectEntry } from '../read-guards';
import { getScenarioProject } from './project';

it('reads the active capture project format through the reader used by step mutations', async () => {
  const project = createGuideProject('Captured instructions');
  const entry = {
    id: project.id,
    project,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    workspaceRevision: 1,
  };
  expect(parseScenarioProjectEntry(entry)?.project).toEqual(project);
  readProjectRow.mockResolvedValue(entry);

  const loaded = await getScenarioProject(project.id);

  expect(readProjectRow).toHaveBeenCalledWith('scenario_projects', project.id);
  expect(loaded).toEqual(project);
});
