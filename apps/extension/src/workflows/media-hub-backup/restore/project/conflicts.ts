import {
  initDB,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  STORE_NAME,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import type { MediaHubImportConflictStrategy } from '../../contracts/types';
import type { VideoProject } from '../../../../features/video/project/types/model';

interface ChildConflictState {
  hasConflict: boolean;
  ids: ReadonlySet<string>;
  records: ReadonlyMap<string, unknown>;
}

export interface VideoChildConflicts {
  projectAssetIds: ChildConflictState;
  projectExportIds: ChildConflictState;
  recordingIds: ChildConflictState;
}

export interface ScenarioChildConflicts {
  scenarioAssetIds: ChildConflictState;
  scenarioExportIds: ChildConflictState;
  stepIds: ChildConflictState;
}

export async function createVideoChildConflicts(args: {
  projectAssetIds: string[];
  projectExportIds: string[];
  recordingIds: string[];
}): Promise<VideoChildConflicts> {
  return {
    projectAssetIds: await createChildConflictState(PROJECT_ASSETS_STORE, args.projectAssetIds),
    projectExportIds: await createChildConflictState(PROJECT_EXPORTS_STORE, args.projectExportIds),
    recordingIds: await createChildConflictState(STORE_NAME, args.recordingIds),
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
  return (
    conflicts.projectAssetIds.hasConflict ||
    conflicts.projectExportIds.hasConflict ||
    conflicts.recordingIds.hasConflict
  );
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
  for (const record of conflicts.recordingIds.records.values()) {
    assertRecordingOwnedByProjectExport(record, projectId, conflicts.projectExportIds.records);
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

function assertRecordingOwnedByProjectExport(
  record: unknown,
  projectId: string,
  projectExportRecords: ReadonlyMap<string, unknown>
): void {
  const isOwned = [...projectExportRecords.values()].some(
    (exportRecord) =>
      isRecord(exportRecord) &&
      exportRecord['projectId'] === projectId &&
      exportRecord['recordingId'] === readRecordId(record)
  );
  if (!isOwned) {
    throw new Error('Backup project child record conflicts with an existing record.');
  }
}

function readRecordId(record: unknown): string | undefined {
  return isRecord(record) && typeof record['id'] === 'string' ? record['id'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}
