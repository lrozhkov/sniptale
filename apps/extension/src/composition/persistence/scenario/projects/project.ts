import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';
import { parseDbEntries } from '../../infrastructure/indexed-db/read-primitives';
import {
  parseScenarioAssetEntry,
  parseScenarioExportEntry,
  parseScenarioProjectEntry,
} from '../read-guards';
import {
  initDB,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
} from '../../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import type { ScenarioProjectEntry } from '../contracts';
import { createScenarioProjectEntry } from './entry';
import { parseScenarioProject } from './guards/project/root/parse';

export interface SaveScenarioProjectOptions {
  baseUpdatedAt?: number | null;
}

class StaleScenarioProjectSaveError extends Error {
  constructor(projectId: string) {
    super(`Scenario project ${projectId} was changed before this save completed`);
    this.name = 'StaleScenarioProjectSaveError';
  }
}

function assertScenarioProjectBaseRevision(args: {
  existing: ScenarioProjectEntry | undefined;
  options: SaveScenarioProjectOptions;
  projectId: string;
}): void {
  if (args.options.baseUpdatedAt === undefined) {
    return;
  }

  if (!args.existing) {
    if (args.options.baseUpdatedAt !== null) {
      throw new StaleScenarioProjectSaveError(args.projectId);
    }
    return;
  }

  if (args.options.baseUpdatedAt !== args.existing.project.updatedAt) {
    throw new StaleScenarioProjectSaveError(args.projectId);
  }
}

function readOwnedScenarioChildId(value: unknown, projectId: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record['projectId'] !== projectId || typeof record['id'] !== 'string') {
    return null;
  }
  return record['id'];
}

export async function saveScenarioProject(
  project: ScenarioProject,
  options: SaveScenarioProjectOptions = {}
): Promise<ScenarioProject> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(SCENARIO_PROJECTS_STORE, 'readwrite');
    const projectStore = tx.objectStore(SCENARIO_PROJECTS_STORE);
    const existing = parseScenarioProjectEntry(await projectStore.get(project.id)) ?? undefined;
    assertScenarioProjectBaseRevision({ existing, options, projectId: project.id });
    const entry = createScenarioProjectEntry({ existing, project });
    await projectStore.put(entry);
    await tx.done;
    return parseScenarioProject(entry.project) ?? project;
  });
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
    .map(({ project }) => project)
    .map((project) => ({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
      tags: project.tags ?? [],
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteScenarioProject(id: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const projectId = id;
    const [rawAssets, rawExports, stepDocuments] = await Promise.all([
      db.getAllFromIndex(SCENARIO_ASSETS_STORE, 'projectId', projectId),
      db.getAllFromIndex(SCENARIO_EXPORTS_STORE, 'projectId', projectId),
      db.getAllFromIndex(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, 'projectId', projectId) as Promise<
        Array<{ stepId: string }>
      >,
    ]);
    const assetIds = rawAssets.flatMap((asset) => {
      const parsed = parseScenarioAssetEntry(asset);
      const assetId = parsed?.id ?? readOwnedScenarioChildId(asset, projectId);
      return assetId ? [assetId] : [];
    });
    const exportIds = rawExports.flatMap((entry) => {
      const parsed = parseScenarioExportEntry(entry);
      const exportId = parsed?.id ?? readOwnedScenarioChildId(entry, projectId);
      return exportId ? [exportId] : [];
    });
    const tx = db.transaction(
      [
        SCENARIO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        SCENARIO_EXPORTS_STORE,
        SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
      ],
      'readwrite'
    );

    await tx.objectStore(SCENARIO_PROJECTS_STORE).delete(projectId);

    for (const assetId of assetIds) {
      await tx.objectStore(SCENARIO_ASSETS_STORE).delete(assetId);
    }

    for (const exportId of exportIds) {
      await tx.objectStore(SCENARIO_EXPORTS_STORE).delete(exportId);
    }

    for (const entry of stepDocuments) {
      await tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).delete(entry.stepId);
    }

    await tx.done;
  });
}
