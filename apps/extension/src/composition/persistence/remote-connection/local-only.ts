import { readSyncQueueHistoryProgressInTransaction } from '../sync-capture/queue-history';
import {
  queueHash,
  queueOperationPrefix,
  parseSyncQueueOperation,
} from '../sync-capture/queue-model';
import { parseAssetResidencyRecord } from '../assets/residency-records';
import { initDB } from '../infrastructure/indexed-db/core';
import * as stores from '../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { runWithAssetResourceRead } from '../assets/resource-sessions';
import { parseAssetRef } from '../assets/guards';
import { readAssetFile } from '../assets';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { readSyncQueueSourceInTransaction } from '../sync-capture/queue';
import { withSyncConnectionAdmissionLock } from './coordination';
import { clearLocalOnlySyncConnectionInTransaction } from './store';
import { parseConnectionMetadata } from './model';
import type { IDBPTransaction } from 'idb';

type Transaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
const retainedStores = [stores.ASSET_REFS_STORE, stores.MEDIA_LIBRARY_STORE];
const detachStores = [
  ...retainedStores,
  stores.SYNC_CAPTURE_STORE,
  stores.SYNC_OUTBOX_STORE,
  stores.SYNC_CONNECTION_STORE,
  stores.SYNC_CATALOG_CACHE_STORE,
  stores.ASSET_RESIDENCY_STORE,
];

/** Fixed failure codes keep native records and credentials intact on refusal. */
export class SyncLocalOnlyError extends Error {
  constructor(
    readonly code: 'missing-bytes' | 'local-changed' | 'pending-outgoing' | 'invalid-data'
  ) {
    super(`Local-only transition refused: ${code}.`);
  }
}

async function retainedSet(tx: Transaction) {
  const refs = [];
  for (const raw of await tx.objectStore(stores.ASSET_REFS_STORE).getAll()) {
    const ref = parseAssetRef(raw);
    if (!ref) throw new SyncLocalOnlyError('invalid-data');
    refs.push(ref);
  }
  const inline = [];
  for (const key of await tx.objectStore(stores.MEDIA_LIBRARY_STORE).getAllKeys()) {
    const media = parseMediaLibraryEntry(await tx.objectStore(stores.MEDIA_LIBRARY_STORE).get(key));
    if (!media) throw new SyncLocalOnlyError('invalid-data');
    if (media.source.kind === 'screenshot') {
      if (
        !media.blob ||
        media.blob.size !== media.size ||
        (media.blob.type && media.blob.type !== media.mimeType)
      )
        throw new SyncLocalOnlyError('missing-bytes');
      inline.push({
        id: media.id,
        createdAt: media.createdAt,
        revision: media.workspaceRevision ?? 0,
        size: media.size,
        mimeType: media.mimeType,
        blobType: media.blob.type,
      });
    }
  }
  return { refs, inline };
}

async function historyDelivered(
  tx: Transaction,
  scope: Parameters<typeof readSyncQueueSourceInTransaction>[1],
  operationId: string | null
): Promise<boolean> {
  const source = await readSyncQueueSourceInTransaction(tx, scope, operationId);
  try {
    return (
      (await readSyncQueueHistoryProgressInTransaction(
        tx,
        queueHash(source.key),
        source.eventSequence
      )) === source.eventSequence
    );
  } catch {
    // Invalid diagnostic progress is an explicit history gap; native data still has its own checks.
    return false;
  }
}

async function settledCaptures(
  tx: Transaction,
  scope: Parameters<typeof readSyncQueueSourceInTransaction>[1]
) {
  let historyComplete = await historyDelivered(tx, scope, null);
  const prefix = queueOperationPrefix(scope);
  for (const key of await tx.objectStore(stores.SYNC_OUTBOX_STORE).getAllKeys()) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
    const raw = parseSyncQueueOperation(await tx.objectStore(stores.SYNC_OUTBOX_STORE).get(key));
    if (!raw) throw new SyncLocalOnlyError('invalid-data');
    const row = await readSyncQueueSourceInTransaction(tx, scope, raw.operationId);
    if (
      row.kind !== 'queue-operation' ||
      (row.status !== 'published' && row.status !== 'cancelled')
    )
      throw new SyncLocalOnlyError('pending-outgoing');
    historyComplete = (await historyDelivered(tx, scope, raw.operationId)) && historyComplete;
  }

  for (const key of await tx.objectStore(stores.SYNC_CAPTURE_STORE).getAllKeys()) {
    const row = parseSyncCaptureRecord(await tx.objectStore(stores.SYNC_CAPTURE_STORE).get(key));
    if (!row || row.spaceId !== scope.spaceId) throw new SyncLocalOnlyError('invalid-data');
    if (row.kind === 'sync-operation') {
      if (
        row.profileCreatedAt !== scope.profileCreatedAt ||
        row.connectionGeneration !== scope.connectionGeneration
      )
        throw new SyncLocalOnlyError('invalid-data');
      if (row.phase !== 'published') {
        const queued = await readSyncQueueSourceInTransaction(tx, scope, row.operationId);
        if (queued.kind !== 'queue-operation' || queued.status !== 'cancelled')
          throw new SyncLocalOnlyError('pending-outgoing');
      }
    }
  }
  return historyComplete;
}

/** After runtime containment, preserve all native bytes and retire only the old synchronization namespace. */
export async function completeSyncLocalOnly(
  expectedInput: unknown
): Promise<'delivered' | 'incomplete'> {
  const expected = parseConnectionMetadata(structuredClone(expectedInput));
  if (!expected || expected.phase !== 'paused') throw new SyncLocalOnlyError('invalid-data');
  const db = await initDB();
  return withSyncConnectionAdmissionLock(() =>
    runWithPersistenceMutationPermit(() =>
      runWithAssetResourceRead(async () => {
        const before = db.transaction(retainedStores, 'readonly');
        const retained = await retainedSet(before);
        await before.done;
        for (const ref of retained.refs) {
          try {
            await readAssetFile(ref, ref.assetId);
          } catch {
            throw new SyncLocalOnlyError('missing-bytes');
          }
        }
        const tx = db.transaction(detachStores, 'readwrite');
        try {
          if (JSON.stringify(await retainedSet(tx)) !== JSON.stringify(retained))
            throw new SyncLocalOnlyError('local-changed');
          const historyComplete = await settledCaptures(tx, expected.binding);
          await clearLocalOnlySyncConnectionInTransaction(tx, expected);
          await tx.objectStore(stores.SYNC_CATALOG_CACHE_STORE).clear();
          // Pins/budget are local preferences. Remote recovery descriptors lose authority with the profile.
          for (const key of await tx.objectStore(stores.ASSET_RESIDENCY_STORE).getAllKeys()) {
            const record = parseAssetResidencyRecord(
              await tx.objectStore(stores.ASSET_RESIDENCY_STORE).get(key)
            );
            if (!record) throw new SyncLocalOnlyError('invalid-data');
            if (record.kind === 'copy')
              await tx.objectStore(stores.ASSET_RESIDENCY_STORE).delete(key);
          }
          await tx.done;
          return historyComplete ? ('delivered' as const) : ('incomplete' as const);
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* The transaction may already have aborted. */
          }
          await tx.done.catch(() => undefined);
          throw error;
        }
      })
    )
  );
}
