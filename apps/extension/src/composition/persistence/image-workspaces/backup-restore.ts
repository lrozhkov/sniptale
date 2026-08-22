import type { AssetOwner, AssetRef } from '../assets';
import type { StoredImageWorkspaceEntry } from './contracts';

interface PutStore<T> {
  put(value: T): Promise<unknown>;
}

export async function putImageWorkspaceBackupRestore(args: {
  entry: StoredImageWorkspaceEntry;
  ownerStore: PutStore<AssetOwner>;
  refsByAssetId: ReadonlyMap<string, AssetRef>;
  refStore: PutStore<AssetRef>;
  workspaceStore: PutStore<StoredImageWorkspaceEntry>;
}): Promise<void> {
  for (const asset of args.entry.document.assets) {
    const ref = args.refsByAssetId.get(asset.assetId);
    if (!ref) throw new Error(`Restored editor asset ref is missing: ${asset.assetId}.`);
    await args.refStore.put(ref);
    await args.ownerStore.put({
      assetId: ref.assetId,
      ownerId: args.entry.aggregateId,
      ownerKind: 'image-workspace',
      role: asset.role,
    });
  }
  await args.workspaceStore.put(args.entry);
}
