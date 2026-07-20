import {
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';

export async function deleteWebSnapshotMediaAsset(args: {
  assetId: string;
  snapshotId: string;
}): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [WEB_SNAPSHOTS_STORE, MEDIA_LIBRARY_STORE, THUMBNAILS_STORE],
      'readwrite'
    );

    await tx.objectStore(WEB_SNAPSHOTS_STORE).delete(args.snapshotId);
    await tx.objectStore(MEDIA_LIBRARY_STORE).delete(args.assetId);
    await tx.objectStore(THUMBNAILS_STORE).delete(args.assetId);
    await tx.done;
  });
}
