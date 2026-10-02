import type { AssetReadyJournal, AssetRef } from './contracts';
import {
  deleteReadyJournal,
  releaseAssetPublicationTransitions,
  writeReadyJournal,
} from './opfs-store';
import {
  runWithDurableAssetLifecycleLock,
  type DurableAssetLifecyclePermit,
} from '../infrastructure/mutation-barrier';
import { initDB } from '../infrastructure/indexed-db/core';

import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { ASSET_OPERATIONS_STORE } from '../infrastructure/indexed-db/core';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from './operations';

/** A known publication precondition was invalidated by another authoritative write. */
export class SupersededAssetPublicationError extends Error {
  constructor() {
    super('The prepared source was superseded.');
    this.name = 'SupersededAssetPublicationError';
  }
}
/** Legacy journals without a source precondition cannot overwrite a different source. */
export class UnresolvedAssetPublicationError extends Error {
  constructor() {
    super('The legacy source publication cannot be resolved safely.');
    this.name = 'UnresolvedAssetPublicationError';
  }
}

export function assertSourcePublicationVersion(
  previous: string | undefined,
  next: string,
  expected: string | null | undefined
): boolean {
  if (previous === next) return true;
  if (expected === undefined) {
    if (previous !== undefined) throw new UnresolvedAssetPublicationError();
  } else if ((previous ?? null) !== expected) throw new SupersededAssetPublicationError();
  return false;
}

/** Durable cancellation releases only unowned staged bytes after dropping this ready claim. */
export async function cancelAssetPublication(
  journal: AssetReadyJournal,
  permit?: DurableAssetLifecyclePermit
): Promise<void> {
  await initDB();
  await runWithDurableAssetLifecycleLock(async (activePermit) => {
    const operation = buildPhysicalDeleteOperation(journal.assetRefs.map((ref) => ref.assetId));
    await runWithIndexedDbMutation((db) => db.put(ASSET_OPERATIONS_STORE, operation));
    await deleteReadyJournal(journal.journalId);
    await completePhysicalDeleteOperation(operation, activePermit);
  }, permit);
}

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
  publish: (
    journal: AssetReadyJournal,
    lifecyclePermit?: DurableAssetLifecyclePermit
  ) => Promise<void>
): Promise<void> {
  // Cold database admission reserves the exclusive transition gate; it must settle before
  // the durable asset lifecycle lock is held or callers waiting on that lock can deadlock
  // against this context's shared transition leases. Admission runs inside the guarded
  // section so a rejection still reaches the staged-lease release below.
  let publicationError: unknown;
  try {
    await initDB();
    await runWithDurableAssetLifecycleLock((permit) =>
      publishReadyJournal(journal, publish, permit)
    );
  } catch (error) {
    publicationError = error;
  }
  let releaseError: unknown;
  try {
    await releaseAssetPublicationTransitions(journal.assetRefs.map((ref) => ref.assetId));
  } catch (error) {
    releaseError = error;
  }
  if (releaseError !== undefined) {
    if (publicationError !== undefined) {
      throw new AggregateError(
        [publicationError, releaseError],
        'Asset publication failed and persistence admission could not be released.',
        { cause: publicationError }
      );
    }
    throw releaseError;
  }
  if (publicationError !== undefined) throw publicationError;
}

async function publishReadyJournal(
  journal: AssetReadyJournal,
  publish: (
    journal: AssetReadyJournal,
    lifecyclePermit?: DurableAssetLifecyclePermit
  ) => Promise<void>,
  lifecyclePermit: DurableAssetLifecyclePermit
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < IMMEDIATE_PUBLICATION_ATTEMPTS; attempt += 1) {
    try {
      await publish(journal, lifecyclePermit);
    } catch (error) {
      if (error instanceof SupersededAssetPublicationError) {
        await cancelAssetPublication(journal, lifecyclePermit);
        throw error;
      }
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
