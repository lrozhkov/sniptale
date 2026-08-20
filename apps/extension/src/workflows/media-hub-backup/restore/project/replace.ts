import type { VideoProjectEntry } from '../../../../composition/persistence/projects/contracts';
import type { StoredProjectExportEntry } from '../../../../composition/persistence/projects/contracts';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../storage/constants';
import { getStore } from '../../storage';
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_EXPORT_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from '../../../../composition/persistence/projects/asset-publication';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../../../../composition/persistence/projects/read-guards';
import { parseStoredVideoProjectAssetReferences } from '../../../../composition/persistence/projects/asset-references';
import { parseScenarioAssetEntry } from '../../../../composition/persistence/scenario/read-guards';
import { parseScenarioStepEditorDocumentEntry } from '../../../../composition/persistence/scenario/editor-documents';
import {
  SCENARIO_ASSET_OWNER_KIND,
  SCENARIO_ASSET_ROLE,
} from '../../../../composition/persistence/scenario/aggregate-mutations';

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
  const obsoleteProjectMediaAssetIds: string[] = [];
  const existing = (await getStore(tx, VIDEO_PROJECTS_STORE).get(projectId)) as
    | VideoProjectEntry
    | undefined;
  const projectAssetIds =
    existing?.project.assets.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    ) ?? [];
  const projectExports = (
    await getStore(tx, PROJECT_EXPORTS_STORE).index('projectId').getAll(projectId)
  )
    .map(parseProjectExportEntry)
    .filter((entry): entry is StoredProjectExportEntry => entry !== null);

  const projectRows: unknown[] = await getStore(tx, VIDEO_PROJECTS_STORE)
    .index('updatedAt')
    .getAll();
  for (const raw of projectRows) {
    const storedReferences = parseStoredVideoProjectAssetReferences(raw);
    if (!storedReferences || storedReferences.projectId === projectId) continue;
    if (projectAssetIds.some((assetId) => storedReferences.assetIds.has(assetId))) {
      throw new Error('Backup project asset is shared with another existing project.');
    }
  }

  for (const assetId of projectAssetIds) {
    const obsoleteAssetId = await deleteProjectAssetMirror(tx, assetId);
    if (obsoleteAssetId) obsoleteProjectMediaAssetIds.push(obsoleteAssetId);
  }
  for (const entry of projectExports) {
    const assetId = await deleteProjectExportMirror(tx, entry);
    if (assetId) obsoleteProjectMediaAssetIds.push(assetId);
  }
  await getStore(tx, THUMBNAILS_STORE).delete(`video-project:${projectId}`);
  await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).delete(['video-project', projectId]);
  return obsoleteProjectMediaAssetIds;
}

async function deleteProjectAssetMirror(
  tx: BackupTransaction,
  assetId: string
): Promise<string | null> {
  const entry = parseProjectAssetEntry(await getStore(tx, PROJECT_ASSETS_STORE).get(assetId));
  await getStore(tx, PROJECT_ASSETS_STORE).delete(assetId);
  await getStore(tx, MEDIA_LIBRARY_STORE).delete(`project-asset:${assetId}`);
  await getStore(tx, THUMBNAILS_STORE).delete(`project-asset:${assetId}`);
  await getStore(tx, ASSET_OWNERS_STORE).delete([
    PROJECT_ASSET_OWNER_KIND,
    assetId,
    PROJECT_MEDIA_ASSET_ROLE,
  ]);
  if (entry) await getStore(tx, ASSET_REFS_STORE).delete(entry.assetId);
  return entry?.assetId ?? null;
}

async function deleteProjectExportMirror(
  tx: BackupTransaction,
  entry: StoredProjectExportEntry
): Promise<string | null> {
  await getStore(tx, PROJECT_EXPORTS_STORE).delete(entry.id);
  await getStore(tx, MEDIA_LIBRARY_STORE).delete(`export:${entry.id}`);
  await getStore(tx, THUMBNAILS_STORE).delete(`export:${entry.id}`);
  await getStore(tx, ASSET_OWNERS_STORE).delete([
    PROJECT_EXPORT_OWNER_KIND,
    entry.id,
    PROJECT_MEDIA_ASSET_ROLE,
  ]);
  await getStore(tx, ASSET_REFS_STORE).delete(entry.assetId);
  return entry.assetId;
}

export async function deleteExistingScenarioProjectBundle(
  tx: BackupTransaction,
  projectId: string
): Promise<string[]> {
  const obsoleteAssetIds: string[] = [];
  const [assets, exports, stepDocuments] = await Promise.all([
    getStore(tx, SCENARIO_ASSETS_STORE).index('projectId').getAll(projectId),
    getStore(tx, SCENARIO_EXPORTS_STORE).index('projectId').getAll(projectId),
    getStore(tx, SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).index('projectId').getAll(projectId),
  ]);
  if (stepDocuments.some((entry) => parseScenarioStepEditorDocumentEntry(entry) !== null)) {
    throw new Error(
      'Legacy backup replace cannot overwrite file-backed scenario documents; use skip or duplicate.'
    );
  }

  for (const asset of assets) {
    const entry = parseScenarioAssetEntry(asset);
    const scenarioAssetId = readStringField(asset, 'id');
    if (scenarioAssetId) {
      await getStore(tx, SCENARIO_ASSETS_STORE).delete(scenarioAssetId);
      await getStore(tx, ASSET_OWNERS_STORE).delete([
        SCENARIO_ASSET_OWNER_KIND,
        scenarioAssetId,
        SCENARIO_ASSET_ROLE,
      ]);
      if (entry) {
        await getStore(tx, ASSET_REFS_STORE).delete(entry.assetId);
        obsoleteAssetIds.push(entry.assetId);
      }
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
    if (stepId) await getStore(tx, SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).delete(stepId);
  }
  await getStore(tx, THUMBNAILS_STORE).delete(`scenario:${projectId}`);
  await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).delete(['scenario', projectId]);
  return obsoleteAssetIds;
}

function readStringField(value: unknown, field: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === 'string' ? fieldValue : null;
}
