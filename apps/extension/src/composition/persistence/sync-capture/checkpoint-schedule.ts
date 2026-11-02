import type { IDBPTransaction } from 'idb';
import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_OUTBOX_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { createProjectMutationStores } from '../projects/mutation-stores';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import {
  parseSyncConnectionIdentity,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { captureRootCheckpointInTransaction, type SyncCheckpointCaptureOutcome } from './capture';
import { tryRunWithSyncCheckpointPublication } from './checkpoint-publication';
import { parseSyncCaptureRecord } from './guards';
import { readSyncQueueSourceInTransaction, requireSyncQueueScopeInTransaction } from './queue';
import {
  parseSyncQueueScope,
  type SyncQueueScope,
  type SyncQueueCaptureProgress,
} from './queue-model';

type Transaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
const metadataStores = [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE];
const prefix = '["pending-checkpoint",';
async function abort(tx: Transaction) {
  try {
    tx.abort();
  } catch {
    /* A failed transaction can already be closed. */
  }
  await tx.done.catch(() => undefined);
}
async function admission(
  tx: Transaction,
  scope: SyncQueueScope,
  authorization: SyncConnectionIdentity
) {
  await requireSyncQueueScopeInTransaction(tx, scope);
  await checkSyncConnectionAdmission(tx, scope, authorization);
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  const connection = await readSyncQueueSourceInTransaction(tx, scope, null);
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    connection.kind !== 'queue-connection' ||
    connection.paused
  )
    throw new Error('Sync checkpoint scheduling refused.');
  return connection;
}
function sameProgress(
  left: SyncQueueCaptureProgress | undefined,
  right: SyncQueueCaptureProgress | undefined
) {
  return !left || !right
    ? left === right
    : left.revision === right.revision &&
        sameSyncConnectionIdentity(left.authorization, right.authorization) &&
        left.afterKey === right.afterKey;
}
/** Aggregate root/pass counts contain no source identity or native payload. */
interface SyncCheckpointScheduleCounts {
  capturedRoots: number;
  acknowledgedRoots: number;
  deadlineWaitingRoots: number;
  scopeMismatchRoots: number;
  invalidPendingRoots: number;
  revisionChangedRoots: number;
  predecessorWaitingRoots: number;
  admissionRefusedRoots: number;
  captureFailedRoots: number;
  deferredRoots: number;
  publicationBusyPasses: number;
  progressChangedPasses: number;
  admissionRefusedPasses: number;
  failedPasses: number;
}

/** Synchronous advisory observations; acknowledgements include only completed native transactions. */
export type SyncCheckpointScheduleObservation =
  | { phase: 'preparing' }
  | { phase: 'settled'; counts: Readonly<SyncCheckpointScheduleCounts> };

/** Visit one bounded pending suffix. Native checkpoint admission remains atomic per root. */
export async function materializeDueSyncCheckpoints(
  scopeInput: unknown,
  identityInput: unknown,
  observer?: (observation: SyncCheckpointScheduleObservation) => void
) {
  const counts: SyncCheckpointScheduleCounts = {
    capturedRoots: 0,
    acknowledgedRoots: 0,
    deadlineWaitingRoots: 0,
    scopeMismatchRoots: 0,
    invalidPendingRoots: 0,
    revisionChangedRoots: 0,
    predecessorWaitingRoots: 0,
    admissionRefusedRoots: 0,
    captureFailedRoots: 0,
    deferredRoots: 0,
    publicationBusyPasses: 0,
    progressChangedPasses: 0,
    admissionRefusedPasses: 0,
    failedPasses: 0,
  };
  const observe = (observation: SyncCheckpointScheduleObservation) => {
    try {
      observer?.(observation);
    } catch {
      /* Diagnostics cannot change capture, continuation, or retained native work. */
    }
  };
  let preparing = false;
  let failureReported = false;
  try {
    // Capture before waiting. Erasure must not reopen a replacement database for this command.
    const db = capturePreparedDatabase();
    const scope = parseSyncQueueScope(structuredClone(scopeInput));
    const authorization = parseSyncConnectionIdentity(structuredClone(identityInput));
    if (!db || !scope || !authorization) {
      counts.admissionRefusedPasses++;
      failureReported = true;
      throw new Error('Invalid sync checkpoint scheduling scope.');
    }
    const empty = { captured: 0, skipped: 0, refused: 0, remaining: false, advanced: false };
    if ((await tryRunWithSyncCheckpointPublication(() => true)) === null) {
      counts.publicationBusyPasses++;
      return empty;
    }

    let previous: SyncQueueCaptureProgress | undefined;
    let keys: IDBValidKey[] = [];
    const candidates: { key: IDBValidKey; row: ReturnType<typeof parseSyncCaptureRecord> }[] = [];
    await runWithPersistenceMutationPermit(async () => {
      const discovery = db.transaction(metadataStores, 'readonly');
      let admitted = false;
      try {
        previous = (await admission(discovery, scope, authorization)).checkpointProgress;
        admitted = true;
        const after =
          previous && sameSyncConnectionIdentity(previous.authorization, authorization)
            ? previous.afterKey
            : null;
        keys = await discovery
          .objectStore(SYNC_CAPTURE_STORE)
          .getAllKeys(IDBKeyRange.bound(after ?? prefix, `${prefix}\uffff`, after !== null), 65);
        for (const key of keys.slice(0, 64))
          candidates.push({
            key,
            row: parseSyncCaptureRecord(await discovery.objectStore(SYNC_CAPTURE_STORE).get(key)),
          });
        await discovery.done;
      } catch (error) {
        if (!admitted) {
          counts.admissionRefusedPasses++;
          failureReported = true;
        }
        await abort(discovery);
        throw error;
      }
    });
    const result = { ...empty };
    let attempts = 0;
    let examined = 0;
    const now = Date.now();
    for (const { key, row } of candidates) {
      if (attempts >= 16) break;
      examined++;
      if (!row || row.kind !== 'pending-checkpoint' || row.key !== key) {
        result.refused++;
        counts.invalidPendingRoots++;
        continue;
      }
      if (
        row.spaceId !== scope.spaceId ||
        row.profileCreatedAt !== scope.profileCreatedAt ||
        row.connectionGeneration !== scope.connectionGeneration
      ) {
        result.skipped++;
        counts.scopeMismatchRoots++;
        continue;
      }
      if (row.dueAt > now) {
        result.skipped++;
        counts.deadlineWaitingRoots++;
        continue;
      }
      attempts++;
      if (!preparing) {
        preparing = true;
        observe({ phase: 'preparing' });
      }
      const admitted = await tryRunWithSyncCheckpointPublication(() =>
        runWithPersistenceMutationPermit(async () => {
          const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
          let admitted = false;
          try {
            await admission(tx, scope, authorization);
            admitted = true;
            const observation: { outcome?: SyncCheckpointCaptureOutcome } = {};
            const capture = await captureRootCheckpointInTransaction(tx, row, {
              now,
              onOutcome: (outcome) => {
                observation.outcome = outcome;
              },
            });
            await tx.done;
            if (capture) {
              result.captured++;
              counts.capturedRoots++;
              counts.acknowledgedRoots++;
            } else {
              result.skipped++;
              switch (observation.outcome) {
                case 'acknowledged':
                  counts.acknowledgedRoots++;
                  break;
                case 'deadline-waiting':
                  counts.deadlineWaitingRoots++;
                  break;
                case 'admission-refused':
                  counts.admissionRefusedRoots++;
                  break;
                case 'revision-changed':
                  counts.revisionChangedRoots++;
                  break;
                case 'predecessor-waiting':
                  counts.predecessorWaitingRoots++;
                  break;
                case undefined:
                  counts.deferredRoots++;
              }
            }
          } catch {
            await abort(tx);
            result.refused++;
            if (admitted) counts.captureFailedRoots++;
            else counts.admissionRefusedRoots++;
          }
          return true;
        })
      );
      if (admitted === null) {
        counts.publicationBusyPasses++;
        return result;
      }
    }
    return await runWithPersistenceMutationPermit(async () => {
      const progressTx = db.transaction(metadataStores, 'readwrite');
      let admitted = false;
      try {
        const connection = await admission(progressTx, scope, authorization);
        admitted = true;
        if (!sameProgress(previous, connection.checkpointProgress)) {
          await progressTx.done;
          counts.progressChangedPasses++;
          return result;
        }
        const revision = (previous?.revision ?? 0) + 1;
        if (!Number.isSafeInteger(revision)) throw new Error('Sync checkpoint progress exhausted.');
        result.remaining = keys.length > examined;
        result.advanced = examined > 0;
        await progressTx.objectStore(SYNC_OUTBOX_STORE).put({
          ...connection,
          checkpointProgress: {
            authorization,
            revision,
            afterKey: result.remaining ? candidates[examined - 1]!.key : null,
          },
        });
        await progressTx.done;
      } catch (error) {
        if (!admitted) {
          counts.admissionRefusedPasses++;
          failureReported = true;
        }
        await abort(progressTx);
        throw error;
      }
      return result;
    });
  } catch (error) {
    if (!failureReported) counts.failedPasses++;
    throw error;
  } finally {
    if (Object.values(counts).some((count) => count > 0))
      observe({ phase: 'settled', counts: { ...counts } });
  }
}
