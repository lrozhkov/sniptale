import { expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../../features/scenario/project/public';

const commit = vi.hoisted(() => vi.fn());
vi.mock('../aggregate-mutations', async (original) => ({
  ...(await original<typeof import('../aggregate-mutations')>()),
  commitScenarioAggregateMutation: commit,
}));

import * as scenarioProjectAssets from './assets';
import * as scenarioProjectExports from './exports';
import * as scenarioProjectsFacade from './index';
import * as scenarioProjects from './project';

it('returns the exact owner-issued scenario revision with its committed project', async () => {
  const project = createGuideProject('Versioned', 'versioned', 1);
  const result = { project: { ...project, updatedAt: 2 }, workspaceRevision: 37 };
  commit.mockResolvedValueOnce(result);
  await expect(
    scenarioProjects.saveScenarioProject(project, { expectedRevision: 17 })
  ).resolves.toBe(result);
  expect(commit).toHaveBeenCalledWith(project, { expectedRevision: 17 });
});

it('re-exports scenario project store roles through the canonical facade', () => {
  expect(scenarioProjectsFacade.saveScenarioProject).toBe(scenarioProjects.saveScenarioProject);
  expect(scenarioProjectsFacade.getScenarioProject).toBe(scenarioProjects.getScenarioProject);
  expect(scenarioProjectsFacade.listScenarioProjects).toBe(scenarioProjects.listScenarioProjects);
  expect(scenarioProjectsFacade.deleteScenarioProject).toBe(scenarioProjects.deleteScenarioProject);
  expect(scenarioProjectsFacade.getScenarioAsset).toBe(scenarioProjectAssets.getScenarioAsset);
  expect(scenarioProjectsFacade.listScenarioAssets).toBe(scenarioProjectAssets.listScenarioAssets);
  expect(scenarioProjectsFacade.savePendingScenarioAsset).toBe(
    scenarioProjectAssets.savePendingScenarioAsset
  );
  expect(scenarioProjectsFacade.getPendingScenarioAsset).toBe(
    scenarioProjectAssets.getPendingScenarioAsset
  );
  expect(scenarioProjectsFacade.deletePendingScenarioAsset).toBe(
    scenarioProjectAssets.deletePendingScenarioAsset
  );
  expect(scenarioProjectsFacade.saveScenarioExport).toBe(scenarioProjectExports.saveScenarioExport);
  expect(scenarioProjectsFacade.listScenarioExports).toBe(
    scenarioProjectExports.listScenarioExports
  );
  expect(scenarioProjectsFacade.deleteScenarioExport).toBe(
    scenarioProjectExports.deleteScenarioExport
  );
});
