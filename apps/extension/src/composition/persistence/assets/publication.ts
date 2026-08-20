import type { AssetReadyJournal, AssetRef } from './contracts';
import { deleteReadyJournal, writeReadyJournal } from './opfs-store';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';

const IMMEDIATE_PUBLICATION_ATTEMPTS = 3;

function createId(): string {
  if (typeof crypto.randomUUID !== 'function')
    throw new Error('Secure journal IDs are unavailable.');
  return crypto.randomUUID();
}

export async function createAssetPublicationJournal<TPayload>(args: {
  assetRefs: AssetRef[];
  domain: string;
  operationId?: string;
  payload: TPayload;
}): Promise<AssetReadyJournal<TPayload>> {
  const journal: AssetReadyJournal<TPayload> = {
    assetRefs: args.assetRefs,
    createdAt: Date.now(),
    domain: args.domain,
    journalId: createId(),
    ...(args.operationId ? { operationId: args.operationId } : {}),
    payload: args.payload,
  };
  await runWithDurableAssetLifecycleLock(() => writeReadyJournal(journal));
  return journal;
}

export async function publishReadyJournalWithRetry(
  journal: AssetReadyJournal,
  publish: (journal: AssetReadyJournal) => Promise<void>
): Promise<void> {
  return runWithDurableAssetLifecycleLock(() => publishReadyJournal(journal, publish));
}

async function publishReadyJournal(
  journal: AssetReadyJournal,
  publish: (journal: AssetReadyJournal) => Promise<void>
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < IMMEDIATE_PUBLICATION_ATTEMPTS; attempt += 1) {
    try {
      await publish(journal);
    } catch (error) {
      lastError = error;
      continue;
    }
    try {
      await deleteReadyJournal(journal.journalId);
    } catch {
      // Publication is authoritative after its transaction commits. The durable
      // journal remains available for idempotent startup recovery.
    }
    return;
  }
  throw lastError;
}
