import { expect, it } from 'vitest';

import * as scenarioProjectAssets from './assets';
import * as scenarioProjectExports from './exports';
import * as scenarioProjectsFacade from './index';
import * as scenarioProjects from './project';

it('re-exports scenario project store roles through the canonical facade', () => {
  expect(scenarioProjectsFacade.saveScenarioProject).toBe(scenarioProjects.saveScenarioProject);
  expect(scenarioProjectsFacade.getScenarioProject).toBe(scenarioProjects.getScenarioProject);
  expect(scenarioProjectsFacade.listScenarioProjects).toBe(scenarioProjects.listScenarioProjects);
  expect(scenarioProjectsFacade.deleteScenarioProject).toBe(scenarioProjects.deleteScenarioProject);
  expect(scenarioProjectsFacade.saveScenarioAsset).toBe(scenarioProjectAssets.saveScenarioAsset);
  expect(scenarioProjectsFacade.getScenarioAsset).toBe(scenarioProjectAssets.getScenarioAsset);
  expect(scenarioProjectsFacade.listScenarioAssets).toBe(scenarioProjectAssets.listScenarioAssets);
  expect(scenarioProjectsFacade.deleteScenarioAsset).toBe(
    scenarioProjectAssets.deleteScenarioAsset
  );
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
