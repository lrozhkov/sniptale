import {
  initDB,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaHubImportConflictStrategy } from '../../contracts/types';
import type { VideoProject } from '../../../../features/video/project/types/model';
import { parseStoredVideoProjectAssetReferences } from '../../../../composition/persistence/projects/asset-references';

interface ChildConflictState {
  hasConflict: boolean;
  ids: ReadonlySet<string>;
  records: ReadonlyMap<string, unknown>;
}

export interface VideoChildConflicts {
  projectAssetIds: ChildConflictState;
  projectExportIds: ChildConflictState;
}

export interface ScenarioChildConflicts {
  scenarioAssetIds: ChildConflictState;
  scenarioExportIds: ChildConflictState;
  stepIds: ChildConflictState;
}

export async function createVideoChildConflicts(args: {
  projectAssetIds: string[];
  projectExportIds: string[];
}): Promise<VideoChildConflicts> {
  return {
    projectAssetIds: await createChildConflictState(PROJECT_ASSETS_STORE, args.projectAssetIds),
    projectExportIds: await createChildConflictState(PROJECT_EXPORTS_STORE, args.projectExportIds),
  };
}

export async function createScenarioChildConflicts(args: {
  scenarioAssetIds: string[];
  scenarioExportIds: string[];
  stepIds: string[];
}): Promise<ScenarioChildConflicts> {
  return {
    scenarioAssetIds: await createChildConflictState(SCENARIO_ASSETS_STORE, args.scenarioAssetIds),
    scenarioExportIds: await createChildConflictState(
      SCENARIO_EXPORTS_STORE,
      args.scenarioExportIds
    ),
    stepIds: await createChildConflictState(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, args.stepIds),
  };
}

export function hasVideoChildConflict(conflicts: VideoChildConflicts): boolean {
  return conflicts.projectAssetIds.hasConflict || conflicts.projectExportIds.hasConflict;
}

export function hasScenarioChildConflict(conflicts: ScenarioChildConflicts): boolean {
  return (
    conflicts.scenarioAssetIds.hasConflict ||
    conflicts.scenarioExportIds.hasConflict ||
    conflicts.stepIds.hasConflict
  );
}

export function assertReplaceCanOwnVideoChildConflicts(
  strategy: MediaHubImportConflictStrategy,
  projectId: string,
  conflicts: VideoChildConflicts,
  ownedProjectAssetIds: ReadonlySet<string>
): void {
  if (strategy !== 'replace') {
    return;
  }

  for (const projectAssetId of conflicts.projectAssetIds.records.keys()) {
    if (!ownedProjectAssetIds.has(projectAssetId)) {
      throw new Error('Backup project child record conflicts with an existing record.');
    }
  }
  for (const record of conflicts.projectExportIds.records.values()) {
    assertRecordProjectOwner(record, projectId);
  }
}

export async function assertReplaceHasExclusiveProjectAssets(
  strategy: MediaHubImportConflictStrategy,
  projectId: string,
  projectAssetIds: ReadonlySet<string>
): Promise<void> {
  if (strategy !== 'replace' || projectAssetIds.size === 0) return;
  const db = await initDB();
  const projects: unknown[] = await db.getAll(VIDEO_PROJECTS_STORE);
  for (const raw of projects) {
    const storedReferences = parseStoredVideoProjectAssetReferences(raw);
    if (!storedReferences || storedReferences.projectId === projectId) continue;
    if ([...projectAssetIds].some((assetId) => storedReferences.assetIds.has(assetId))) {
      throw new Error('Backup project asset is shared with another existing project.');
    }
  }
}

export function collectExistingVideoProjectAssetIds(
  project: VideoProject | null | undefined
): ReadonlySet<string> {
  return new Set(
    project?.assets?.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    ) ?? []
  );
}

export function assertReplaceCanOwnScenarioChildConflicts(
  strategy: MediaHubImportConflictStrategy,
  projectId: string,
  conflicts: ScenarioChildConflicts
): void {
  if (strategy !== 'replace') {
    return;
  }

  for (const record of conflicts.scenarioAssetIds.records.values()) {
    assertRecordProjectOwner(record, projectId);
  }
  for (const record of conflicts.scenarioExportIds.records.values()) {
    assertRecordProjectOwner(record, projectId);
  }
  for (const record of conflicts.stepIds.records.values()) {
    assertRecordProjectOwner(record, projectId);
  }
}

async function createChildConflictState(
  storeName: string,
  ids: string[]
): Promise<ChildConflictState> {
  const db = await initDB();
  const records = new Map<string, unknown>();
  for (const id of new Set(ids)) {
    const record: unknown = await db.get(storeName, id);
    if (record) {
      records.set(id, record);
    }
  }
  return { hasConflict: records.size > 0, ids: new Set(records.keys()), records };
}

function assertRecordProjectOwner(record: unknown, projectId: string): void {
  if (!isRecord(record) || record['projectId'] !== projectId) {
    throw new Error('Backup project child record conflicts with an existing record.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}
