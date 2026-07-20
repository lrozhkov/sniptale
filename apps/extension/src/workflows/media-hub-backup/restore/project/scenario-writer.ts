import {
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  THUMBNAILS_STORE,
} from '../../storage/constants';
import { getStore } from '../../storage';
import { restoreBlobDescriptor, restoreScenarioAssetBlobDescriptor } from './blobs';
import { remapId } from './ids';
import { readRestoredBlob, remapDescriptorId } from './helpers';
import type { PreparedScenarioProject } from './prepare';
import { remapScenarioProjectEntry } from './remap';
import {
  assertBackupProjectReplacePreflightComplete,
  deleteExistingScenarioProjectBundle,
} from './replace';

type BackupTransaction = Parameters<typeof getStore>[0];

export async function restorePreparedScenarioProjectsInTransaction(
  tx: BackupTransaction,
  preparedProjects: PreparedScenarioProject[],
  restoredBlobs: ReadonlyMap<string, Blob>
) {
  let imported = 0;
  for (const prepared of preparedProjects) {
    await restorePreparedScenarioProject(tx, restoredBlobs, prepared);
    imported += 1;
  }
  return imported;
}

async function restorePreparedScenarioProject(
  tx: BackupTransaction,
  restoredBlobs: ReadonlyMap<string, Blob>,
  prepared: PreparedScenarioProject
) {
  if (prepared.replace) {
    assertBackupProjectReplacePreflightComplete(prepared.projectId);
    await deleteExistingScenarioProjectBundle(tx, prepared.projectId);
  }
  await getStore(tx, SCENARIO_PROJECTS_STORE).put(remapScenarioProjectEntry(prepared));
  await restoreScenarioAssets(tx, restoredBlobs, prepared);
  await restoreScenarioExports(tx, prepared);
  await restoreScenarioStepDocuments(tx, prepared);
  await restoreScenarioThumbnails(tx, restoredBlobs, prepared);
}

async function restoreScenarioAssets(
  tx: BackupTransaction,
  restoredBlobs: ReadonlyMap<string, Blob>,
  prepared: PreparedScenarioProject
) {
  for (const descriptor of prepared.descriptor.assets) {
    await restoreScenarioAssetBlobDescriptor({
      blob: readRestoredBlob(restoredBlobs, descriptor.blobPath),
      descriptor,
      entryPatch: {
        id: remapDescriptorId(descriptor.entry, prepared.scenarioAssetIdMap),
        projectId: prepared.projectId,
      },
      storeName: SCENARIO_ASSETS_STORE,
      tx,
    });
  }
}

async function restoreScenarioExports(tx: BackupTransaction, prepared: PreparedScenarioProject) {
  for (const entry of prepared.descriptor.exports) {
    await getStore(tx, SCENARIO_EXPORTS_STORE).put({
      ...entry,
      id: remapId(prepared.scenarioExportIdMap, entry.id),
      projectId: prepared.projectId,
    });
  }
}

async function restoreScenarioStepDocuments(
  tx: BackupTransaction,
  prepared: PreparedScenarioProject
) {
  for (const entry of prepared.descriptor.stepDocuments) {
    await getStore(tx, SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).put({
      ...entry,
      projectId: prepared.projectId,
      stepId: remapId(prepared.stepIdMap, entry.stepId),
    });
  }
}

async function restoreScenarioThumbnails(
  tx: BackupTransaction,
  restoredBlobs: ReadonlyMap<string, Blob>,
  prepared: PreparedScenarioProject
) {
  if (prepared.descriptor.thumbnail) {
    await restoreBlobDescriptor({
      blob: readRestoredBlob(restoredBlobs, prepared.descriptor.thumbnail.blobPath),
      descriptor: prepared.descriptor.thumbnail,
      entryPatch: { assetId: `scenario:${prepared.projectId}` },
      storeName: THUMBNAILS_STORE,
      tx,
    });
  }
  for (const descriptor of prepared.descriptor.exportThumbnails ?? []) {
    await restoreBlobDescriptor({
      blob: readRestoredBlob(restoredBlobs, descriptor.blobPath),
      descriptor,
      entryPatch: {
        assetId: remapScenarioExportThumbnailId(readDescriptorAssetId(descriptor.entry), prepared),
      },
      storeName: THUMBNAILS_STORE,
      tx,
    });
  }
}

function remapScenarioExportThumbnailId(assetId: string, prepared: PreparedScenarioProject) {
  const exportPrefix = 'scenario-export:';
  if (!assetId.startsWith(exportPrefix)) {
    throw new Error('Invalid scenario export thumbnail backup metadata.');
  }
  const exportId = assetId.slice(exportPrefix.length);
  if (!prepared.descriptor.exports.some((entry) => entry.id === exportId)) {
    throw new Error('Invalid scenario export thumbnail backup metadata.');
  }
  return `${exportPrefix}${remapId(prepared.scenarioExportIdMap, exportId)}`;
}

function readDescriptorAssetId(entry: object) {
  if ('assetId' in entry && typeof entry.assetId === 'string') return entry.assetId;
  throw new Error('Scenario export thumbnail descriptor is missing assetId');
}
