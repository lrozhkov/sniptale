import {
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../storage/constants';
import { restoreBlobDescriptor, restoreProjectAssetBlobDescriptor } from './blobs';
import type { PreparedVideoProject } from './prepare';
import { remapId } from './ids';
import { readRestoredBlob, remapDescriptorId } from './helpers';
import { remapVideoProjectEntry } from './remap';
import {
  assertBackupProjectReplacePreflightComplete,
  deleteExistingVideoProjectBundle,
} from './replace';
import { getStore } from '../../storage';

export { restorePreparedScenarioProjectsInTransaction } from './scenario-writer';

type BackupTransaction = Parameters<typeof getStore>[0];

export async function restorePreparedVideoProjectsInTransaction(
  tx: BackupTransaction,
  preparedProjects: PreparedVideoProject[],
  restoredBlobs: ReadonlyMap<string, Blob>
) {
  let imported = 0;

  for (const prepared of preparedProjects) {
    await restorePreparedVideoProject(tx, restoredBlobs, prepared);
    imported += 1;
  }

  return imported;
}

async function restorePreparedVideoProject(
  tx: BackupTransaction,
  restoredBlobs: ReadonlyMap<string, Blob>,
  prepared: PreparedVideoProject
) {
  if (prepared.replace) {
    assertBackupProjectReplacePreflightComplete(prepared.projectId);
    await deleteExistingVideoProjectBundle(tx, prepared.projectId);
  }

  await getStore(tx, VIDEO_PROJECTS_STORE).put(remapVideoProjectEntry(prepared));
  await restoreVideoProjectAssets(tx, restoredBlobs, prepared);
  await restoreVideoProjectExports(tx, restoredBlobs, prepared);
  await restoreVideoProjectThumbnail(tx, restoredBlobs, prepared);
}

async function restoreVideoProjectAssets(
  tx: BackupTransaction,
  restoredBlobs: ReadonlyMap<string, Blob>,
  prepared: PreparedVideoProject
) {
  for (const descriptor of prepared.descriptor.projectAssets) {
    await restoreProjectAssetBlobDescriptor({
      blob: readRestoredBlob(restoredBlobs, descriptor.blobPath),
      descriptor,
      entryPatch: { id: remapDescriptorId(descriptor.entry, prepared.projectAssetIdMap) },
      storeName: PROJECT_ASSETS_STORE,
      tx,
    });
  }
}

async function restoreVideoProjectExports(
  tx: BackupTransaction,
  restoredBlobs: ReadonlyMap<string, Blob>,
  prepared: PreparedVideoProject
) {
  for (const descriptor of prepared.descriptor.projectExports) {
    const exportId = remapId(prepared.projectExportIdMap, descriptor.entry.id);
    const recordingId = remapId(prepared.recordingIdMap, descriptor.entry.recordingId);
    await restoreBlobDescriptor({
      blob: readRestoredBlob(restoredBlobs, descriptor.recording.blobPath),
      descriptor: descriptor.recording,
      entryPatch: { id: recordingId },
      storeName: STORE_NAME,
      tx,
    });
    await getStore(tx, PROJECT_EXPORTS_STORE).put({
      ...descriptor.entry,
      id: exportId,
      projectId: prepared.projectId,
      recordingId,
    });
    if (descriptor.recordingTelemetry) {
      await getStore(tx, RECORDING_TELEMETRY_STORE).put({
        ...descriptor.recordingTelemetry,
        recordingId,
      });
    }
    if (descriptor.thumbnail) {
      await restoreBlobDescriptor({
        blob: readRestoredBlob(restoredBlobs, descriptor.thumbnail.blobPath),
        descriptor: descriptor.thumbnail,
        entryPatch: { assetId: `export:${exportId}` },
        storeName: THUMBNAILS_STORE,
        tx,
      });
    }
  }
}

async function restoreVideoProjectThumbnail(
  tx: BackupTransaction,
  restoredBlobs: ReadonlyMap<string, Blob>,
  prepared: PreparedVideoProject
) {
  if (prepared.descriptor.thumbnail) {
    await restoreBlobDescriptor({
      blob: readRestoredBlob(restoredBlobs, prepared.descriptor.thumbnail.blobPath),
      descriptor: prepared.descriptor.thumbnail,
      entryPatch: { assetId: `video-project:${prepared.projectId}` },
      storeName: THUMBNAILS_STORE,
      tx,
    });
  }
}
