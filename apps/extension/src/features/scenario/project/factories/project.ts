import type { ScenarioProject } from '../../contracts/types/project';
import { getNow } from './helpers';

export function createScenarioProject(name: string): ScenarioProject {
  const now = getNow();
  return {
    version: 2,
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    tags: [],
    steps: [],
    trash: [],
    suggestedEvents: [],
  };
}
