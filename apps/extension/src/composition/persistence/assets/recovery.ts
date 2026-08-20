import type { AssetPublicationAdapter, AssetReadyJournal } from './contracts';
import { deleteReadyJournal, listReadyJournals } from './opfs-store';
import {
  runWithDurableAssetLifecycleLock,
  runWithPersistenceMutationTransitionRecovery,
  type PersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';

export async function recoverStandaloneAssetPublications(
  adapters: readonly AssetPublicationAdapter[],
  transitionPermit?: PersistenceMutationTransitionPermit
): Promise<number> {
  return runWithPersistenceMutationTransitionRecovery(transitionPermit, () =>
    runWithDurableAssetLifecycleLock(() => recoverStandaloneJournals(adapters))
  );
}

async function recoverStandaloneJournals(
  adapters: readonly AssetPublicationAdapter[]
): Promise<number> {
  const byDomain = new Map(adapters.map((adapter) => [adapter.domain, adapter]));
  let recovered = 0;
  for (const journal of await listReadyJournals()) {
    if (journal.operationId) continue;
    const adapter = byDomain.get(journal.domain);
    if (!adapter) continue;
    await adapter.publish(journal as AssetReadyJournal);
    await deleteReadyJournal(journal.journalId);
    recovered += 1;
  }
  return recovered;
}
