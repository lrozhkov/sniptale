import { vi } from 'vitest';
import { createScenarioProject } from '../../../../features/scenario/project/factories';

export function createLegacyScenarioProjectBundleDb() {
  return {
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async (storeName: string) =>
      storeName === 'scenario_projects' ? [createLegacyScenarioProjectEntry()] : []
    ),
    getAllFromIndex: vi.fn(async () => []),
  };
}

function createLegacyScenarioProjectEntry() {
  const project = { ...createScenarioProject('Legacy scenario'), id: 'legacy-scenario' };
  return { createdAt: 1, id: project.id, project, updatedAt: 2 };
}
