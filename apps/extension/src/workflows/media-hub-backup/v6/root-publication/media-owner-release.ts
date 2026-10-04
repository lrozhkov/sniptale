import type { PhysicalDeleteAssetOperation } from '../../../../composition/persistence/assets';

interface DeleteStore {
  delete(key: IDBValidKey): Promise<unknown>;
}

/** Release one metadata owner and schedule bytes only after the final owner disappears. */
export async function unlinkMediaAssetOwner(args: {
  assetId: string;
  operation: PhysicalDeleteAssetOperation;
  ownerId: string;
  ownerKind: string;
  ownerStore: DeleteStore & {
    index(name: 'assetId'): { count(assetId: string): Promise<number> };
  };
  refStore: DeleteStore;
  role: string;
}): Promise<void> {
  await args.ownerStore.delete([args.ownerKind, args.ownerId, args.role]);
  if ((await args.ownerStore.index('assetId').count(args.assetId)) === 0) {
    await args.refStore.delete(args.assetId);
    args.operation.assetIds.push(args.assetId);
  }
}
