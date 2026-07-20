import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioProjectEntry } from '../contracts';

type StoredScenarioProject = ScenarioProject | ScenarioProjectV3;

function createScenarioProjectRevision(existing: ScenarioProjectEntry | undefined): number {
  const now = Date.now();
  return existing ? Math.max(now, existing.project.updatedAt + 1) : now;
}

export function createScenarioProjectEntry(args: {
  existing: ScenarioProjectEntry | undefined;
  project: ScenarioProject;
}): ScenarioProjectEntry & { project: ScenarioProject };
export function createScenarioProjectEntry(args: {
  existing: ScenarioProjectEntry | undefined;
  project: ScenarioProjectV3;
}): ScenarioProjectEntry & { project: ScenarioProjectV3 };
export function createScenarioProjectEntry(args: {
  existing: ScenarioProjectEntry | undefined;
  project: StoredScenarioProject;
}): ScenarioProjectEntry {
  const updatedAt = createScenarioProjectRevision(args.existing);
  return {
    id: args.project.id,
    project: {
      ...args.project,
      updatedAt,
    },
    createdAt: args.existing?.createdAt ?? args.project.createdAt ?? updatedAt,
    updatedAt,
  };
}
