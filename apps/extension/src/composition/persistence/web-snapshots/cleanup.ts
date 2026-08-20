import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseStoredWebSnapshotRecord } from './guards';
import {
  recoverWebSnapshotPublications,
  WEB_SNAPSHOT_OWNER_KIND,
  WEB_SNAPSHOT_PACKAGE_ROLE,
  WEB_SNAPSHOT_SCREENSHOT_ROLE,
} from './publication';

export async function deleteWebSnapshotMediaAsset(args: {
  assetId: string;
  snapshotId: string;
}): Promise<void> {
  await recoverWebSnapshotPublications();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        WEB_SNAPSHOTS_STORE,
        MEDIA_LIBRARY_STORE,
        THUMBNAILS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const rawSnapshot: unknown = await tx.objectStore(WEB_SNAPSHOTS_STORE).get(args.snapshotId);
    const snapshot = parseStoredWebSnapshotRecord(rawSnapshot);
    if (rawSnapshot !== undefined && !snapshot) {
      throw new Error('Invalid web snapshot cannot be safely removed.');
    }
    const rawMedia: unknown = await tx.objectStore(MEDIA_LIBRARY_STORE).get(args.assetId);
    const media = parseMediaLibraryEntry(rawMedia);
    if (
      rawMedia !== undefined &&
      (!media ||
        media.source.kind !== 'web-snapshot' ||
        media.source.snapshotId !== args.snapshotId)
    ) {
      throw new Error('Web snapshot media ownership does not match its record.');
    }
    if (snapshot) {
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      for (const [assetId, role] of [
        [snapshot.packageAssetId, WEB_SNAPSHOT_PACKAGE_ROLE],
        [snapshot.screenshotAssetId, WEB_SNAPSHOT_SCREENSHOT_ROLE],
      ] as const) {
        await ownerStore.delete([WEB_SNAPSHOT_OWNER_KIND, snapshot.id, role]);
        if ((await ownerStore.index('assetId').count(assetId)) === 0) {
          await tx.objectStore(ASSET_REFS_STORE).delete(assetId);
          physicalDelete.assetIds.push(assetId);
        }
      }
    }
    await tx.objectStore(WEB_SNAPSHOTS_STORE).delete(args.snapshotId);
    await tx.objectStore(MEDIA_LIBRARY_STORE).delete(args.assetId);
    await tx.objectStore(THUMBNAILS_STORE).delete(args.assetId);
    if (physicalDelete.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
}
