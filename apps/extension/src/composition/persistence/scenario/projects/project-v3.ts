import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { initDB, SCENARIO_PROJECTS_STORE } from '../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import type { ScenarioProjectEntry } from '../contracts';
import { isScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { parseDbEntries } from '../../infrastructure/indexed-db/read-primitives';
import { parseScenarioProjectEntry } from '../read-guards';
import { createScenarioProjectEntry } from './entry';
import type { SaveScenarioProjectOptions } from './project';

class StaleScenarioProjectV3SaveError extends Error {
  constructor(projectId: string) {
    super(`Scenario project ${projectId} was changed before this save completed`);
    this.name = 'StaleScenarioProjectV3SaveError';
  }
}

function assertScenarioProjectV3BaseRevision(args: {
  existing: ScenarioProjectEntry | undefined;
  options: SaveScenarioProjectOptions;
  projectId: string;
}): void {
  if (args.options.baseUpdatedAt === undefined) {
    return;
  }

  if (!args.existing) {
    if (args.options.baseUpdatedAt !== null) {
      throw new StaleScenarioProjectV3SaveError(args.projectId);
    }
    return;
  }

  if (args.options.baseUpdatedAt !== args.existing.project.updatedAt) {
    throw new StaleScenarioProjectV3SaveError(args.projectId);
  }
}

export async function saveScenarioProjectV3(
  project: ScenarioProjectV3,
  options: SaveScenarioProjectOptions = {}
): Promise<ScenarioProjectV3> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(SCENARIO_PROJECTS_STORE, 'readwrite');
    const projectStore = tx.objectStore(SCENARIO_PROJECTS_STORE);
    const existing = parseScenarioProjectEntry(await projectStore.get(project.id)) ?? undefined;
    assertScenarioProjectV3BaseRevision({ existing, options, projectId: project.id });
    const entry = createScenarioProjectEntry({ existing, project });
    await projectStore.put(entry);
    await tx.done;
    return isScenarioProjectV3(entry.project) ? entry.project : project;
  });
}

export async function getScenarioProjectV3(id: string): Promise<ScenarioProjectV3 | undefined> {
  const db = await initDB();
  const entry = parseScenarioProjectEntry(await db.get(SCENARIO_PROJECTS_STORE, id)) ?? undefined;
  return isScenarioProjectV3(entry?.project) ? entry.project : undefined;
}

export async function listScenarioProjectsV3(): Promise<
  Array<Pick<ScenarioProjectV3, 'createdAt' | 'id' | 'name' | 'tags' | 'updatedAt'>>
> {
  const db = await initDB();
  const all = parseDbEntries(await db.getAll(SCENARIO_PROJECTS_STORE), parseScenarioProjectEntry);
  return all
    .map(({ project }) => project)
    .filter(isScenarioProjectV3)
    .map((project) => ({
      createdAt: project.createdAt,
      id: project.id,
      name: project.name,
      tags: project.tags,
      updatedAt: project.updatedAt,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
