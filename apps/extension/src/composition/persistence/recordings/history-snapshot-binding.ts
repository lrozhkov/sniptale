import { isHistorySnapshotRef, type FramedHistoryTotals } from './history-snapshot-ref';
import type { AssetRef } from '../assets/contracts';
import { parseAssetRef, parseAssetOwner } from '../assets/guards';
import { SupersededAssetPublicationError } from '../assets/publication';
import { discardPreparedAsset } from '../assets';
import type { IndexedDbWriteTransaction } from '../infrastructure/indexed-db/core';
import { ASSET_REFS_STORE, ASSET_OWNERS_STORE } from '../infrastructure/indexed-db/core.stores';

/** Admits the asset row and its recording owner in the caller's publication transaction. */
export async function hasHistorySnapshotOwner(
  tx: IndexedDbWriteTransaction,
  recordingId: string,
  role: string,
  assetId: string,
  totals: FramedHistoryTotals
): Promise<boolean> {
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['recording', recordingId, role])
  );
  return (
    isHistorySnapshotRef(ref, totals) &&
    ref.assetId === assetId &&
    owner !== null &&
    owner.assetId === assetId &&
    owner.ownerKind === 'recording' &&
    owner.ownerId === recordingId &&
    owner.role === role
  );
}

/** Registers the snapshot without replacing an asset that has different immutable facts. */
export async function putHistorySnapshotOwner(
  tx: IndexedDbWriteTransaction,
  recordingId: string,
  role: string,
  ref: AssetRef,
  sameRef: (left: AssetRef | null, right: AssetRef) => boolean
): Promise<void> {
  const existing: unknown = await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId);
  if (existing !== undefined && !sameRef(parseAssetRef(existing), ref))
    throw new SupersededAssetPublicationError();
  await tx.objectStore(ASSET_REFS_STORE).put(ref);
  await tx
    .objectStore(ASSET_OWNERS_STORE)
    .put({ assetId: ref.assetId, ownerKind: 'recording', ownerId: recordingId, role });
}

/** Releases only this failed preparation's unclaimed immutable copies. */
export async function discardHistorySnapshotCopies(
  refs: AssetRef[],
  error: unknown,
  message: string
): Promise<void> {
  const cleanup = await Promise.allSettled(refs.map((ref) => discardPreparedAsset(ref.assetId)));
  const failures = cleanup.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length) throw new AggregateError([error, ...failures], message, { cause: error });
}
