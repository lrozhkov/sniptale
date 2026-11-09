import type { ReadyPublicationTarget } from './ready-media-claims';
import { MediaAssetDeletionBlockedError } from '../media-library/deletion-errors';
import {
  SupersededAssetPublicationError,
  UnresolvedAssetPublicationError,
  cancelAssetPublication,
} from './publication';
import type { AssetPublicationAdapter, AssetReadyJournal } from './contracts';
import {
  deleteReadyJournal,
  listReadyJournals,
  readAssetReadyPublicationClaims,
} from './opfs-store';
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
  return runWithPersistenceMutationTransitionRecovery(transitionPermit, (activeTransition) =>
    runWithDurableAssetLifecycleLock(async (permit) =>
      recoverStandaloneJournals(adapters, await listReadyJournals(), permit, activeTransition)
    )
  );
}

async function recoverStandaloneJournals(
  adapters: readonly AssetPublicationAdapter[],
  journals: readonly AssetReadyJournal[],
  lifecyclePermit: DurableAssetLifecyclePermit,
  transitionPermit: PersistenceMutationTransitionPermit
): Promise<number> {
  const byDomain = new Map(adapters.map((adapter) => [adapter.domain, adapter]));
  let recovered = 0;
  for (const journal of journals) {
    if (journal.operationId) continue;
    const adapter = byDomain.get(journal.domain);
    if (!adapter) continue;
    let result: void | 'defer';
    try {
      result = await adapter.publish(journal, lifecyclePermit, transitionPermit);
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

/** Replay selected source publications without discovering unrelated journals. */
export async function recoverSelectedAssetPublications(
  adapters: readonly AssetPublicationAdapter[],
  target: ReadyPublicationTarget,
  options: {
    transitionPermit?: PersistenceMutationTransitionPermit;
    lifecyclePermit?: DurableAssetLifecyclePermit;
  } = {}
): Promise<number> {
  await initDB();
  return runWithPersistenceMutationTransitionRecovery(
    options.transitionPermit,
    (activeTransition) =>
      runWithDurableAssetLifecycleLock(async (permit) => {
        const claims = await readAssetReadyPublicationClaims(target, permit);
        if (!claims.valid || (claims.pending && claims.journals.length === 0))
          throw new MediaAssetDeletionBlockedError('pending-publication');
        return recoverStandaloneJournals(adapters, claims.journals, permit, activeTransition);
      }, options.lifecyclePermit)
  );
}
