import type { NativeHistoryPublicationGrant, NativeRecordingHistoryIntent } from './contracts';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import {
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_EVENTS_STORE,
} from '../../infrastructure/indexed-db/core.stores';
import { isCursorTrajectoryHead } from '../cursor-trajectory/guards';
import { isRecordingEventsHead } from '../recording-events/guards';
import { SupersededAssetPublicationError } from '../../assets/publication';

/** Checks the generation and parent binding after the format owner admits a head. */
export function matchesNativeHistorySource(
  head: { writerGeneration: string; stagingJournalId?: string; sourceRecordingId: string } | null,
  writer: { writerGeneration: string },
  intent: Pick<NativeRecordingHistoryIntent, 'operationId' | 'recordingId'>
): boolean {
  return (
    head !== null &&
    head.writerGeneration === writer.writerGeneration &&
    head.stagingJournalId === intent.operationId &&
    head.sourceRecordingId === intent.recordingId
  );
}

/** Selects a private head using the kind-specific key and format admission. */
export async function readPrivateNativeHistoryHead(
  tx: IndexedDbWriteTransaction,
  grant: NativeHistoryPublicationGrant
) {
  if (!grant.writer) return null;
  let head;
  if (grant.kind === 'cursor') {
    const raw: unknown = await tx
      .objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE)
      .get([grant.writer.recordingId, grant.writer.trajectoryId]);
    if (!isCursorTrajectoryHead(raw)) throw new SupersededAssetPublicationError();
    head = raw;
  } else {
    const raw: unknown = await tx
      .objectStore(RECORDING_EVENTS_STORE)
      .get([grant.writer.recordingId, grant.writer.eventStreamId, 'head', 0]);
    if (!isRecordingEventsHead(raw)) throw new SupersededAssetPublicationError();
    head = raw;
  }
  if (!matchesNativeHistorySource(head, grant.writer, grant))
    throw new SupersededAssetPublicationError();
  return head;
}
