import type {
  ProjectExportEntry,
  VideoProjectEntry,
} from '../../../../composition/persistence/projects/contracts';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../storage/constants';
import { getStore } from '../../storage';
import { parseRecordingEntry } from '../../../../composition/persistence/recordings/index.guards';
import {
  RECORDING_ASSET_OWNER_KIND,
  RECORDING_ASSET_ROLE,
} from '../../../../composition/persistence/recordings/asset-publication';

type BackupTransaction = Parameters<typeof getStore>[0];

export function assertBackupProjectReplacePreflightComplete(projectId: string): void {
  if (!projectId) {
    throw new Error('Backup project replace preflight is incomplete.');
  }
}

export async function deleteExistingVideoProjectBundle(
  tx: BackupTransaction,
  projectId: string
): Promise<string[]> {
  const obsoleteRecordingAssetIds: string[] = [];
  const existing = (await getStore(tx, VIDEO_PROJECTS_STORE).get(projectId)) as
    | VideoProjectEntry
    | undefined;
  const projectAssetIds =
    existing?.project.assets.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    ) ?? [];
  const projectExports = (await getStore(tx, PROJECT_EXPORTS_STORE)
    .index('projectId')
    .getAll(projectId)) as ProjectExportEntry[];

  for (const assetId of projectAssetIds) {
    await deleteProjectAssetMirror(tx, assetId);
  }
  for (const entry of projectExports) {
    const assetId = await deleteProjectExportMirror(tx, entry);
    if (assetId) obsoleteRecordingAssetIds.push(assetId);
  }
  await getStore(tx, THUMBNAILS_STORE).delete(`video-project:${projectId}`);
  await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).delete(['video-project', projectId]);
  return obsoleteRecordingAssetIds;
}

async function deleteProjectAssetMirror(tx: BackupTransaction, assetId: string): Promise<void> {
  await getStore(tx, PROJECT_ASSETS_STORE).delete(assetId);
  await getStore(tx, MEDIA_LIBRARY_STORE).delete(`project-asset:${assetId}`);
  await getStore(tx, THUMBNAILS_STORE).delete(`project-asset:${assetId}`);
}

async function deleteProjectExportMirror(
  tx: BackupTransaction,
  entry: ProjectExportEntry
): Promise<string | null> {
  const recording = parseRecordingEntry(await getStore(tx, STORE_NAME).get(entry.recordingId));
  await getStore(tx, PROJECT_EXPORTS_STORE).delete(entry.id);
  await getStore(tx, STORE_NAME).delete(entry.recordingId);
  await getStore(tx, RECORDING_TELEMETRY_STORE).delete(entry.recordingId);
  await getStore(tx, MEDIA_LIBRARY_STORE).delete(`export:${entry.id}`);
  await getStore(tx, THUMBNAILS_STORE).delete(`export:${entry.id}`);
  await getStore(tx, ASSET_OWNERS_STORE).delete([
    RECORDING_ASSET_OWNER_KIND,
    entry.recordingId,
    RECORDING_ASSET_ROLE,
  ]);
  if (recording) await getStore(tx, ASSET_REFS_STORE).delete(recording.assetId);
  return recording?.assetId ?? null;
}

export async function deleteExistingScenarioProjectBundle(
  tx: BackupTransaction,
  projectId: string
): Promise<void> {
  const [assets, exports, stepDocuments] = await Promise.all([
    getStore(tx, SCENARIO_ASSETS_STORE).index('projectId').getAll(projectId),
    getStore(tx, SCENARIO_EXPORTS_STORE).index('projectId').getAll(projectId),
    getStore(tx, SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).index('projectId').getAll(projectId),
  ]);

  for (const asset of assets) {
    const assetId = readStringField(asset, 'id');
    if (assetId) {
      await getStore(tx, SCENARIO_ASSETS_STORE).delete(assetId);
    }
  }
  for (const entry of exports) {
    const exportId = readStringField(entry, 'id');
    if (exportId) {
      await getStore(tx, SCENARIO_EXPORTS_STORE).delete(exportId);
      await getStore(tx, THUMBNAILS_STORE).delete(`scenario-export:${exportId}`);
    }
  }
  for (const entry of stepDocuments) {
    const stepId = readStringField(entry, 'stepId');
    if (stepId) {
      await getStore(tx, SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).delete(stepId);
    }
  }
  await getStore(tx, THUMBNAILS_STORE).delete(`scenario:${projectId}`);
  await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).delete(['scenario', projectId]);
}

function readStringField(value: unknown, field: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' ? fieldValue : null;
}
