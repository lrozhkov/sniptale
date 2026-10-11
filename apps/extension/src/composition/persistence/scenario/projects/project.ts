import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { parseDbEntries } from '../../infrastructure/indexed-db/read-primitives';
import { parseScenarioProjectEntry, parseScenarioProjectSummary } from '../read-guards';
import type { ScenarioProjectSummary } from '../../../../features/scenario/contracts/types/project';
import { initDB, SCENARIO_PROJECTS_STORE } from '../../infrastructure/indexed-db/core';
import type { ScenarioProjectEntry, ScenarioProjectSnapshot } from '../contracts';
import {
  commitScenarioAggregateMutation,
  recoverScenarioAssetPublications,
} from '../aggregate-mutations';
import { deleteScenarioAggregate } from '../aggregate-cleanup';

export interface SaveScenarioProjectOptions {
  /** Compatibility predicate for callers outside the versioned editor session. */
  baseUpdatedAt?: number | null;
  /** Captured owner revision; null admits only a new root. */
  expectedRevision?: number | null;
  storageClass?: import('../../library-lifecycle/contracts').LibraryStorageClass;
}

/** Publishes through the aggregate owner and returns its exact committed project/revision pair. */
export async function saveScenarioProject(
  project: GuideProject,
  options: SaveScenarioProjectOptions = {}
): Promise<ScenarioProjectSnapshot> {
  const result = await commitScenarioAggregateMutation(project, {
    ...(options.baseUpdatedAt === undefined ? {} : { expectedUpdatedAt: options.baseUpdatedAt }),
    ...(options.expectedRevision === undefined
      ? {}
      : { expectedRevision: options.expectedRevision }),
    ...(options.storageClass === undefined ? {} : { storageClass: options.storageClass }),
  });
  return result;
}

export async function getScenarioProject(id: string): Promise<GuideProject | undefined> {
  await recoverScenarioAssetPublications();
  const db = await initDB();
  const raw: unknown = await db.get(SCENARIO_PROJECTS_STORE, id);
  if (raw === undefined) return undefined;
  const entry = parseScenarioProjectEntry(raw);
  if (!entry) throw new Error('Scenario project content is unavailable.');
  return entry.project;
}

export async function getScenarioProjectEntry(
  id: string
): Promise<ScenarioProjectEntry | undefined> {
  await recoverScenarioAssetPublications();
  const db = await initDB();
  return parseScenarioProjectEntry(await db.get(SCENARIO_PROJECTS_STORE, id)) ?? undefined;
}

export async function listScenarioProjects(): Promise<ScenarioProjectSummary[]> {
  await recoverScenarioAssetPublications();
  const db = await initDB();
  return parseDbEntries(await db.getAll(SCENARIO_PROJECTS_STORE), parseScenarioProjectSummary).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}

export async function listScenarioProjectEntries(): Promise<ScenarioProjectEntry[]> {
  await recoverScenarioAssetPublications();
  const db = await initDB();
  return parseDbEntries(await db.getAll(SCENARIO_PROJECTS_STORE), parseScenarioProjectEntry).sort(
    (left, right) => right.updatedAt - left.updatedAt
  );
}

export async function deleteScenarioProject(id: string): Promise<void> {
  await deleteScenarioAggregate(id);
}
