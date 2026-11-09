import { openRecordingCursorTrajectoryStream } from '../../../composition/persistence/recordings/cursor-trajectory/reader';
import type { ArchiveStreamSource } from '../../../composition/archive-transfer';
import type { createRecordingCursorTrajectoryStore } from '../../../composition/persistence/recordings/cursor-trajectory/store';
import type { RecordingCursorTrajectoryWriter } from '../../../composition/persistence/recordings/cursor-trajectory/contracts';
import { stageRecordingCursorTrajectoryStream } from '../../../composition/persistence/recordings/cursor-trajectory/snapshot';
import { isPortableCursorTrajectoryAttachment } from './root-codecs/cursor-trajectory';

type Store = ReturnType<typeof createRecordingCursorTrajectoryStore>;
/** Library inventory reads the database that its composition already admitted. */
export type CursorTrajectoryArchiveStore = Pick<Store, 'getHead' | 'readBlock'>;
/** Opens a repeatable, generation-bound export. No historical block bytes remain in the plan. */
export async function openStoredCursorTrajectoryStream(
  store: CursorTrajectoryArchiveStore,
  raw: unknown,
  expectedGeneration?: string
): Promise<ArchiveStreamSource> {
  if (!isPortableCursorTrajectoryAttachment(raw))
    throw new Error('Invalid cursor trajectory attachment.');
  const attachment = structuredClone(raw);
  const identity = {
    recordingId: attachment.recordingId,
    trajectoryId: attachment.descriptor.trajectoryId,
  };
  const stream = await openRecordingCursorTrajectoryStream(
    store,
    identity,
    attachment.descriptor,
    expectedGeneration
  );
  if (
    stream.source.sourceRecordingId !== attachment.sourceRecordingId ||
    stream.source.width !== attachment.width ||
    stream.source.height !== attachment.height
  )
    throw new Error('Cursor trajectory attachment is unavailable.');
  return { size: stream.size, pipeTo: stream.pipeTo };
}

/** Stages a verified stream under a caller-owned private identity. It cannot publish a root. */
export async function stageCursorTrajectoryStream(args: {
  store: Pick<Store, 'begin' | 'append' | 'finalize' | 'retire'>;
  attachment: unknown;
  source: ArchiveStreamSource;
  stagingRecordingId: string;
  stagingJournalId?: string;
  signal?: AbortSignal;
}): Promise<RecordingCursorTrajectoryWriter> {
  if (!isPortableCursorTrajectoryAttachment(args.attachment))
    throw new Error('Invalid cursor trajectory attachment.');
  const attachment = structuredClone(args.attachment);
  if (
    args.source.size !== attachment.descriptor.totalBytes + attachment.descriptor.totalBlocks * 4 ||
    args.source.directory ||
    args.stagingRecordingId === attachment.recordingId ||
    args.stagingRecordingId === attachment.sourceRecordingId
  )
    throw new Error('Invalid cursor trajectory staging source.');
  return stageRecordingCursorTrajectoryStream({
    store: args.store,
    identity: {
      recordingId: args.stagingRecordingId,
      trajectoryId: attachment.descriptor.trajectoryId,
    },
    sourceIdentity: attachment,
    source: args.source,
    ...(args.stagingJournalId ? { stagingJournalId: args.stagingJournalId } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
}
