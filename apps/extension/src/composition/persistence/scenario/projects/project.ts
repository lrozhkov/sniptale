import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';
import { parseDbEntries } from '../../infrastructure/indexed-db/read-primitives';
import { parseScenarioProjectEntry } from '../read-guards';
import { initDB, SCENARIO_PROJECTS_STORE } from '../../infrastructure/indexed-db/core';
import type { ScenarioProjectEntry } from '../contracts';
import { parseScenarioProject } from './guards/project/root/parse';
import { commitScenarioAggregateMutation, deleteScenarioAggregate } from '../aggregate-mutations';

export interface SaveScenarioProjectOptions {
  baseUpdatedAt?: number | null;
  expectedRevision?: number | null;
  storageClass?: import('../../library-lifecycle/contracts').LibraryStorageClass;
}

export async function saveScenarioProject(
  project: ScenarioProject,
  options: SaveScenarioProjectOptions = {}
): Promise<ScenarioProject> {
  const result = await commitScenarioAggregateMutation(project, {
    ...(options.baseUpdatedAt === undefined ? {} : { expectedUpdatedAt: options.baseUpdatedAt }),
    ...(options.expectedRevision === undefined
      ? {}
      : { expectedRevision: options.expectedRevision }),
    ...(options.storageClass === undefined ? {} : { storageClass: options.storageClass }),
  });
  return parseScenarioProject(result.project) ?? project;
}

export async function getScenarioProject(id: string): Promise<ScenarioProject | undefined> {
  const db = await initDB();
  const entry = parseScenarioProjectEntry(await db.get(SCENARIO_PROJECTS_STORE, id)) ?? undefined;
  return parseScenarioProject(entry?.project) ?? undefined;
}

export async function getScenarioProjectEntry(
  id: string
): Promise<ScenarioProjectEntry | undefined> {
  const db = await initDB();
  return parseScenarioProjectEntry(await db.get(SCENARIO_PROJECTS_STORE, id)) ?? undefined;
}

export async function listScenarioProjects(): Promise<
  Array<Pick<ScenarioProject, 'id' | 'name' | 'updatedAt' | 'createdAt' | 'tags'>>
> {
  const db = await initDB();
  const all = parseDbEntries(await db.getAll(SCENARIO_PROJECTS_STORE), parseScenarioProjectEntry);
  return all
    .map(({ lifecycle, project, workspaceRevision }) => ({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
      tags: project.tags ?? [],
      lifecycle,
      workspaceRevision,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listScenarioProjectEntries(): Promise<ScenarioProjectEntry[]> {
  const db = await initDB();
  return parseDbEntries(await db.getAll(SCENARIO_PROJECTS_STORE), parseScenarioProjectEntry).sort(
    (left, right) => right.updatedAt - left.updatedAt
  );
}

export async function deleteScenarioProject(id: string): Promise<void> {
  await deleteScenarioAggregate(id);
}
