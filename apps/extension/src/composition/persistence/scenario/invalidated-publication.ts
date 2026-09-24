import { deleteAssetObject, deleteReadyJournal, type AssetReadyJournal } from '../assets';
import { ASSET_REFS_STORE, initDB } from '../infrastructure/indexed-db/core';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';

/** Drops a failed journal before discarding only its newly staged objects. */
export async function discardInvalidatedBorrowedPublication(
  journal: AssetReadyJournal,
  lifecycleLockHeld = false
): Promise<void> {
  const db = await initDB();
  const cleanup = async () => {
    for (const ref of journal.assetRefs) {
      if (await db.get(ASSET_REFS_STORE, ref.assetId)) {
        throw new Error('Invalidated scenario publication has an attached staged object.');
      }
    }
    await deleteReadyJournal(journal.journalId);
    await Promise.all(journal.assetRefs.map((ref) => deleteAssetObject(ref.assetId)));
  };
  if (lifecycleLockHeld) await cleanup();
  else await runWithDurableAssetLifecycleLock(cleanup);
}
