import { deleteUnreferencedMediaSource } from '../media-library/delete-cascade';

/** Compatibility cleanup obeys the same zero-consumer policy as other published sources. */
export async function deleteWebSnapshotMediaAsset(args: {
  assetId: string;
  snapshotId: string;
}): Promise<void> {
  await deleteUnreferencedMediaSource({
    id: args.assetId,
    source: { kind: 'web-snapshot', snapshotId: args.snapshotId },
  });
}
