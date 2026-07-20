import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';

export function createScenarioStoreProjectFixture(): ScenarioProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Scenario',
    createdAt: 10,
    updatedAt: 10,
    steps: [],
    trash: [],
    suggestedEvents: [],
  };
}
