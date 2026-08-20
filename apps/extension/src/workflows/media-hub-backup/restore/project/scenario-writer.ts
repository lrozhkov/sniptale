import {
  AGGREGATE_PRESENTATIONS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  THUMBNAILS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
} from '../../storage/constants';
import { getStore } from '../../storage';
import { restoreBlobDescriptor } from './blobs';
import { remapId } from './ids';
import { readRestoredBlob, remapDescriptorId } from './helpers';
import type { PreparedScenarioProject } from './prepare';
import { remapScenarioProjectEntry } from './remap';
import {
  assertBackupProjectReplacePreflightComplete,
  deleteExistingScenarioProjectBundle,
} from './replace';
import {
  SCENARIO_ASSET_OWNER_KIND,
  SCENARIO_ASSET_ROLE,
} from '../../../../composition/persistence/scenario/aggregate-mutations';

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
    prepared.obsoleteScenarioAssetIds = await deleteExistingScenarioProjectBundle(
      tx,
      prepared.projectId
    );
  }
  await getStore(tx, SCENARIO_PROJECTS_STORE).put(remapScenarioProjectEntry(prepared));
  await restoreScenarioAssets(tx, prepared);
  await restoreScenarioExports(tx, prepared);
  await restoreScenarioStepDocuments(tx, prepared);
  await restoreScenarioThumbnails(tx, restoredBlobs, prepared);
  if (prepared.restoredPresentation) {
    await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).put(prepared.restoredPresentation);
  }
}

async function restoreScenarioAssets(tx: BackupTransaction, prepared: PreparedScenarioProject) {
  for (const descriptor of prepared.descriptor.assets) {
    const restored = prepared.restoredScenarioAssets?.get(descriptor.blobPath);
    if (!restored) throw new Error('Prepared scenario asset is missing.');
    const id = remapDescriptorId(descriptor.entry, prepared.scenarioAssetIdMap);
    await getStore(tx, ASSET_REFS_STORE).put(restored.asset.ref);
    await getStore(tx, ASSET_OWNERS_STORE).put({
      assetId: restored.asset.ref.assetId,
      ownerId: id,
      ownerKind: SCENARIO_ASSET_OWNER_KIND,
      role: SCENARIO_ASSET_ROLE,
    });
    await getStore(tx, SCENARIO_ASSETS_STORE).put({
      ...descriptor.entry,
      assetId: restored.asset.ref.assetId,
      id,
      mimeType: restored.asset.ref.mimeType,
      projectId: prepared.projectId,
      size: restored.asset.ref.size,
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
  _tx: BackupTransaction,
  _prepared: PreparedScenarioProject
) {
  // Legacy V4/V5 editor documents embed bytes in JSON and are retired at the V29 alpha cutover.
  // V6 restore owns file-backed document publication.
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
