import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { initDB, SCENARIO_PROJECTS_STORE } from '../../infrastructure/indexed-db/core';
import { isScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { parseDbEntries } from '../../infrastructure/indexed-db/read-primitives';
import { parseScenarioProjectEntry } from '../read-guards';
import type { SaveScenarioProjectOptions } from './project';
import { commitScenarioAggregateMutation } from '../aggregate-mutations';

export async function saveScenarioProjectV3(
  project: ScenarioProjectV3,
  options: SaveScenarioProjectOptions = {}
): Promise<ScenarioProjectV3> {
  const result = await commitScenarioAggregateMutation(project, {
    ...(options.baseUpdatedAt === undefined ? {} : { expectedUpdatedAt: options.baseUpdatedAt }),
    ...(options.expectedRevision === undefined
      ? {}
      : { expectedRevision: options.expectedRevision }),
    ...(options.storageClass === undefined ? {} : { storageClass: options.storageClass }),
  });
  return isScenarioProjectV3(result.project) ? result.project : project;
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
