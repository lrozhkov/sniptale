import {
  SupersededAssetPublicationError,
  UnresolvedAssetPublicationError,
  cancelAssetPublication,
} from './publication';
import type { AssetPublicationAdapter, AssetReadyJournal } from './contracts';
import { deleteReadyJournal, listReadyJournals } from './opfs-store';
import { initDB } from '../infrastructure/indexed-db/core';
import {
  runWithDurableAssetLifecycleLock,
  runWithPersistenceMutationTransitionRecovery,
  type PersistenceMutationTransitionPermit,
  type DurableAssetLifecyclePermit,
} from '../infrastructure/mutation-barrier';

export async function recoverStandaloneAssetPublications(
  adapters: readonly AssetPublicationAdapter[],
  transitionPermit?: PersistenceMutationTransitionPermit
): Promise<number> {
  // Cold database admission reserves the exclusive transition gate; it must settle before
  // this recovery holds the shared transition gate and the durable asset lifecycle lock,
  // or journal replay would queue the exclusive request behind its own shared hold.
  await initDB();
  return runWithPersistenceMutationTransitionRecovery(transitionPermit, () =>
    runWithDurableAssetLifecycleLock((permit) => recoverStandaloneJournals(adapters, permit))
  );
}

async function recoverStandaloneJournals(
  adapters: readonly AssetPublicationAdapter[],
  lifecyclePermit: DurableAssetLifecyclePermit
): Promise<number> {
  const byDomain = new Map(adapters.map((adapter) => [adapter.domain, adapter]));
  let recovered = 0;
  for (const journal of await listReadyJournals()) {
    if (journal.operationId) continue;
    const adapter = byDomain.get(journal.domain);
    if (!adapter) continue;
    let result: void | 'defer';
    try {
      result = await adapter.publish(journal as AssetReadyJournal, lifecyclePermit);
    } catch (error) {
      if (error instanceof UnresolvedAssetPublicationError) continue;
      if (!(error instanceof SupersededAssetPublicationError)) throw error;
      await cancelAssetPublication(journal, lifecyclePermit);
      recovered += 1;
      continue;
    }
    if (result === 'defer') continue;
    await deleteReadyJournal(journal.journalId);
    recovered += 1;
  }
  return recovered;
}
