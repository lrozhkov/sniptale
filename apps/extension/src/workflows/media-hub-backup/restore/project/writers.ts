import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../storage/constants';
import { restoreBlobDescriptor } from './blobs';
import type { PreparedVideoProject } from './prepare';
import { remapId } from './ids';
import { readRestoredBlob } from './helpers';
import { remapVideoProjectEntry } from './remap';
import {
  assertBackupProjectReplacePreflightComplete,
  deleteExistingVideoProjectBundle,
} from './replace';
import { getStore } from '../../storage';
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_EXPORT_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from '../../../../composition/persistence/projects/asset-publication';
import {
  buildProjectAssetMediaEntry,
  buildProjectExportMediaEntry,
} from '../../../../composition/persistence/media-library/entry-mapping';

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
    prepared.obsoleteProjectMediaAssetIds = await deleteExistingVideoProjectBundle(
      tx,
      prepared.projectId
    );
  }

  await getStore(tx, VIDEO_PROJECTS_STORE).put(remapVideoProjectEntry(prepared));
  await restoreVideoProjectAssets(tx, prepared);
  await restoreVideoProjectExports(tx, restoredBlobs, prepared);
  await restoreVideoProjectThumbnail(tx, restoredBlobs, prepared);
  if (prepared.restoredPresentation) {
    await getStore(tx, AGGREGATE_PRESENTATIONS_STORE).put(prepared.restoredPresentation);
  }
}

async function restoreVideoProjectAssets(tx: BackupTransaction, prepared: PreparedVideoProject) {
  for (const descriptor of prepared.descriptor.projectAssets) {
    const id = remapId(prepared.projectAssetIdMap, descriptor.entry.id);
    const restored = prepared.restoredProjectAssets?.get(descriptor.blobPath);
    if (!restored) throw new Error('Prepared project asset is missing.');
    const entry = {
      ...descriptor.entry,
      assetId: restored.asset.ref.assetId,
      id,
      mimeType: restored.asset.ref.mimeType,
      size: restored.asset.ref.size,
    };
    await getStore(tx, PROJECT_ASSETS_STORE).put(entry);
    await getStore(tx, ASSET_REFS_STORE).put(restored.asset.ref);
    await getStore(tx, ASSET_OWNERS_STORE).put({
      assetId: restored.asset.ref.assetId,
      ownerId: id,
      ownerKind: PROJECT_ASSET_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await getStore(tx, MEDIA_LIBRARY_STORE).put(buildProjectAssetMediaEntry(entry));
  }
}

async function restoreVideoProjectExports(
  tx: BackupTransaction,
  restoredBlobs: ReadonlyMap<string, Blob>,
  prepared: PreparedVideoProject
) {
  for (const descriptor of prepared.descriptor.projectExports) {
    const exportId = remapId(prepared.projectExportIdMap, descriptor.entry.id);
    const restored = prepared.restoredProjectExportAssets?.get(descriptor.recording.blobPath);
    if (!restored) throw new Error('Prepared project export asset is missing.');
    const entry = {
      assetId: restored.asset.ref.assetId,
      createdAt: descriptor.entry.createdAt,
      duration: descriptor.entry.duration,
      filename: descriptor.entry.filename,
      fps: descriptor.entry.fps,
      height: descriptor.entry.height,
      id: exportId,
      mimeType: restored.asset.ref.mimeType,
      projectId: prepared.projectId,
      size: restored.asset.ref.size,
      width: descriptor.entry.width,
      ...(descriptor.entry.format ? { format: descriptor.entry.format } : {}),
    };
    await getStore(tx, ASSET_REFS_STORE).put(restored.asset.ref);
    await getStore(tx, ASSET_OWNERS_STORE).put({
      assetId: restored.asset.ref.assetId,
      ownerId: exportId,
      ownerKind: PROJECT_EXPORT_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await getStore(tx, PROJECT_EXPORTS_STORE).put(entry);
    await getStore(tx, MEDIA_LIBRARY_STORE).put(buildProjectExportMediaEntry(entry));
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
