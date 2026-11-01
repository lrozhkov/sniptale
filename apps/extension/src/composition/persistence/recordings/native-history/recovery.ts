import { createLogger } from '@sniptale/platform/observability/logger';
import { initDB } from '../../infrastructure/indexed-db/core';
import { NATIVE_TRANSFER_SESSIONS_STORE } from '../../infrastructure/indexed-db/core.stores';
import {
  runWithPersistenceMutationTransitionRecovery,
  type PersistenceMutationTransitionPermit,
} from '../../infrastructure/mutation-barrier';
import { createRecordingCursorTrajectoryStore } from '../cursor-trajectory/store';
import { createRecordingEventsStore } from '../recording-events/store';
import { saveNativeRecordingHistory } from '../telemetry';
import { isNativeRecordingHistoryParent, isNativeRecordingHistoryIntent } from './guards';
import { createNativeRecordingHistoryStore } from './store';
import type { NativeRecordingHistoryIntent } from './contracts';

const logger = createLogger({ namespace: 'NativeRecordingHistoryRecovery' });
const totalsMatch = (
  head: { totalBlocks: number; totalRecords: number; totalBytes: number; streamSha256: string },
  descriptor: {
    totalBlocks: number;
    totalRecords: number;
    totalBytes: number;
    streamSha256: string;
  }
) =>
  head.totalBlocks === descriptor.totalBlocks &&
  head.totalRecords === descriptor.totalRecords &&
  head.totalBytes === descriptor.totalBytes &&
  head.streamSha256 === descriptor.streamSha256;

/** Recovers only bytes already accepted locally. A partial network transfer remains pending. */
async function recoverStream(
  intent: NativeRecordingHistoryIntent,
  kind: 'cursor' | 'events',
  permit: PersistenceMutationTransitionPermit
): Promise<boolean> {
  const owner = createNativeRecordingHistoryStore();
  const slot = kind === 'cursor' ? intent.cursor : intent.events;
  if (!slot || slot.pull?.kind === 'published' || !slot.descriptor.finalized) return false;
  await owner.admit(intent);
  if (slot.pull?.kind !== 'verified' && slot.pull?.kind !== 'unavailable') {
    if (slot.descriptor.state === 'unavailable' && slot.descriptor.totalBlocks === 0) {
      if (kind === 'cursor' && intent.cursor)
        await owner.savePull(intent, {
          kind,
          descriptor: intent.cursor.descriptor,
          pull: { kind: 'unavailable' },
        });
      else if (kind === 'events' && intent.events)
        await owner.savePull(intent, {
          kind,
          descriptor: intent.events.descriptor,
          pull: { kind: 'unavailable' },
        });
    } else if (kind === 'cursor' && intent.cursor?.writer) {
      const { writer, descriptor } = intent.cursor;
      const store = createRecordingCursorTrajectoryStore({
        database: initDB,
        mintGeneration: () => crypto.randomUUID(),
      });
      const head = await store.getHead(writer);
      if (
        !head ||
        head.writerGeneration !== writer.writerGeneration ||
        head.stagingJournalId !== intent.operationId ||
        head.sourceRecordingId !== intent.recordingId ||
        head.width !== intent.width ||
        head.height !== intent.height ||
        head.totalSamples !== descriptor.totalSamples ||
        !totalsMatch(head, descriptor)
      )
        return false;
      await store.finalize(writer, descriptor, descriptor.state);
      await owner.savePull(intent, { kind, descriptor, pull: { kind: 'verified' } });
    } else if (kind === 'events' && intent.events?.writer) {
      const { writer, descriptor } = intent.events;
      const store = createRecordingEventsStore({
        database: initDB,
        mintGeneration: () => crypto.randomUUID(),
      });
      const head = await store.getHead(writer);
      if (
        !head ||
        head.writerGeneration !== writer.writerGeneration ||
        head.stagingJournalId !== intent.operationId ||
        head.sourceRecordingId !== intent.recordingId ||
        !totalsMatch(head, descriptor)
      )
        return false;
      await store.finalize(writer, descriptor);
      await owner.savePull(intent, { kind, descriptor, pull: { kind: 'verified' } });
    } else return false;
  }
  await saveNativeRecordingHistory(intent.recordingId, kind, permit);
  return true;
}

/** Reads one operational parent at a time and reuses the live publication authority. */
export async function recoverNativeRecordingHistories(
  transitionPermit?: PersistenceMutationTransitionPermit
): Promise<number> {
  const db = await initDB();
  return runWithPersistenceMutationTransitionRecovery(transitionPermit, async (permit) => {
    let after: IDBValidKey | undefined;
    let recovered = 0;
    for (;;) {
      const tx = db.transaction(NATIVE_TRANSFER_SESSIONS_STORE, 'readonly');
      const cursor = await tx.store.openCursor(
        after === undefined ? undefined : IDBKeyRange.lowerBound(after, true)
      );
      const raw: unknown = cursor?.value;
      after = cursor?.key;
      await tx.done;
      if (!cursor) return recovered;
      if (
        !isNativeRecordingHistoryParent(raw) ||
        !isNativeRecordingHistoryIntent(raw.metadata.history) ||
        raw.metadata.history.phase !== 'pending'
      )
        continue;
      const recordingId = raw.id;
      for (const kind of ['cursor', 'events'] as const) {
        try {
          const intent = await createNativeRecordingHistoryStore().read(recordingId);
          if (intent?.phase === 'pending' && (await recoverStream(intent, kind, permit)))
            recovered++;
        } catch {
          // Optional history must retain its durable intent without blocking the video or other recordings.
          logger.warn('Native recording history recovery remains pending', { kind });
        }
      }
    }
  });
}
