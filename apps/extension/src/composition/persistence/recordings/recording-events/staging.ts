import { sha256 } from '@noble/hashes/sha2.js';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import { RECORDING_EVENTS_STORE as STORE } from '../../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../../infrastructure/indexed-db/transaction';
import { RecordingEventsError, type RecordingEventsIdentity } from './contracts';
import {
  isRecordingEventsHead,
  isRecordingEventsIdentity,
  recordingEventsIdentifier,
  recordingEventsHex,
} from './guards';
import { retireRecordingEventsInTransaction } from './retirement';

const hash = (value: string) => recordingEventsHex(sha256(new TextEncoder().encode(value)));
function prefix(journalId: string): string {
  if (!recordingEventsIdentifier(journalId)) throw new RecordingEventsError('invalid');
  return `events-stage:${hash(journalId).slice(0, 32)}:`;
}

/** Stable journal namespace. Callers add a fresh attempt suffix before they admit bytes. */
export function recordingEventsStagingIdentity(
  journalId: string,
  source: RecordingEventsIdentity
): RecordingEventsIdentity {
  if (!isRecordingEventsIdentity(source)) throw new RecordingEventsError('invalid');
  return {
    recordingId: `${prefix(journalId)}${hash(JSON.stringify([source.recordingId, source.eventStreamId])).slice(0, 32)}`,
    eventStreamId: source.eventStreamId,
  };
}

/** A matching private journal marker grants cleanup authority; a name prefix alone does not. */
export async function retireJournalRecordingEventStagesInTransaction(
  tx: IndexedDbWriteTransaction,
  journalId: string
): Promise<void> {
  const from = prefix(journalId);
  let cursor = await tx.objectStore(STORE).index('kind').openCursor('head');
  while (cursor) {
    const raw: unknown = cursor.value;
    if (
      isPlainRecord(raw) &&
      typeof raw['recordingId'] === 'string' &&
      raw['recordingId'].startsWith(from)
    ) {
      if (!isRecordingEventsHead(raw)) throw new RecordingEventsError('integrity');
      if (raw.stagingJournalId === journalId)
        await retireRecordingEventsInTransaction(
          tx,
          raw,
          () => crypto.randomUUID(),
          raw.writerGeneration
        );
    }
    cursor = await cursor.continue();
  }
}

/** The parent keeps its ready claim and lifecycle lock until this cleanup commits. */
export async function retireJournalRecordingEventStages(journalId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const stores: string[] = [STORE];
    const tx = db.transaction(stores, 'readwrite');
    try {
      await retireJournalRecordingEventStagesInTransaction(tx, journalId);
      await tx.done;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}
