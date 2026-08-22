import type { AssetOwner, AssetRef } from '../assets';
import type { StoredWebSnapshotRecord } from './contracts';

interface PutStore<T> {
  put(value: T): Promise<unknown>;
}

export async function putWebSnapshotBackupRestore(args: {
  ownerStore: PutStore<AssetOwner>;
  packageRef: AssetRef;
  record: StoredWebSnapshotRecord;
  refStore: PutStore<AssetRef>;
  screenshotRef: AssetRef;
  snapshotStore: PutStore<StoredWebSnapshotRecord>;
}): Promise<void> {
  await args.refStore.put(args.packageRef);
  await args.refStore.put(args.screenshotRef);
  await args.ownerStore.put({
    assetId: args.packageRef.assetId,
    ownerId: args.record.id,
    ownerKind: 'web-snapshot',
    role: 'package',
  });
  await args.ownerStore.put({
    assetId: args.screenshotRef.assetId,
    ownerId: args.record.id,
    ownerKind: 'web-snapshot',
    role: 'screenshot',
  });
  await args.snapshotStore.put(args.record);
}
