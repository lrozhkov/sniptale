import { runWithIndexedDbMutation } from '../../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../../infrastructure/indexed-db/transaction';
import { parseRecordingTelemetryEntry } from '../telemetry.guards';
import { createNativeRecordingHistoryStore } from './store';
import { isNativeRecordingHistoryIntent, isNativeHistoryPublicationGrant } from './guards';
import { admitNativeHistoryPublicationInTransaction } from './store';
import {
  NativeRecordingHistoryError,
  type NativeRecordingHistoryIntent,
  type NativeHistoryPublicationGrant,
  type NativeRecordingHistoryParent,
} from './contracts';
import { SupersededAssetPublicationError } from '../../assets/publication';
import { parseAssetRef, parseAssetOwner } from '../../assets/guards';
import type { AssetRef } from '../../assets/contracts';
import type { IndexedDbWriteTransaction } from '../../infrastructure/indexed-db/core';
import {
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_EVENTS_STORE,
} from '../../infrastructure/indexed-db/core.stores';
import type { RecordingTelemetryEntry } from '../contracts';
import { isCursorTrajectoryHead } from '../cursor-trajectory/guards';
import { isRecordingEventsHead } from '../recording-events/guards';
import { publishStagedCursorTrajectoryInTransaction } from '../cursor-trajectory/publication';
import { publishStagedRecordingEventsInTransaction } from '../recording-events/publication';
import { retireCursorTrajectoryInTransaction } from '../cursor-trajectory/retirement';
import { retireRecordingEventsInTransaction } from '../recording-events/retirement';
import {
  RECORDING_CURSOR_SNAPSHOT_ROLE,
  type RecordingCursorTrajectoryWriter,
} from '../cursor-trajectory/contracts';
import {
  RECORDING_EVENTS_SNAPSHOT_ROLE,
  type RecordingEventsWriter,
} from '../recording-events/contracts';

const same = (left: object | undefined, right: object | undefined) =>
  left !== undefined &&
  right !== undefined &&
  JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
const sameRef = (left: AssetRef | null, right: AssetRef) =>
  left !== null &&
  left.assetId === right.assetId &&
  left.createdAt === right.createdAt &&
  left.sha256 === right.sha256 &&
  left.size === right.size &&
  left.mimeType === right.mimeType &&
  left.location.objectKey === right.location.objectKey;

/** Selects one finalized private source without copying protocol buffers into a journal. */
export function createNativeHistoryPublicationGrant(
  intent: NativeRecordingHistoryIntent,
  kind: 'cursor' | 'events'
): NativeHistoryPublicationGrant {
  if (!isNativeRecordingHistoryIntent(intent) || intent.phase === 'cancelled')
    throw new SupersededAssetPublicationError();
  const binding = {
    version: 1 as const,
    operationId: intent.operationId,
    recordingId: intent.recordingId,
    recordingAssetId: intent.recordingAssetId,
    videoSha256: intent.videoSha256,
    controllerLeaseId: intent.controllerLeaseId,
    width: intent.width,
    height: intent.height,
  };
  const slot = kind === 'cursor' ? intent.cursor : intent.events;
  if (
    !slot?.descriptor.finalized ||
    (slot.pull?.kind !== 'verified' &&
      slot.pull?.kind !== 'unavailable' &&
      slot.pull?.kind !== 'published')
  )
    throw new NativeRecordingHistoryError('conflict');
  const grant =
    kind === 'cursor' && intent.cursor
      ? {
          ...binding,
          kind: 'cursor' as const,
          descriptor: intent.cursor.descriptor,
          writer: intent.cursor.writer,
        }
      : kind === 'events' && intent.events
        ? {
            ...binding,
            kind: 'events' as const,
            descriptor: intent.events.descriptor,
            writer: intent.events.writer,
          }
        : null;
  if (!isNativeHistoryPublicationGrant(grant)) throw new NativeRecordingHistoryError('invalid');
  return structuredClone(grant);
}
async function assetBinding(
  tx: IndexedDbWriteTransaction,
  recordingId: string,
  role: string,
  ref: AssetRef,
  totalBytes: number,
  blocks: number,
  hash: string
) {
  const stored = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['recording', recordingId, role])
  );
  if (
    !sameRef(stored, ref) ||
    ref.mimeType !== 'application/octet-stream' ||
    ref.size !== totalBytes + blocks * 4 ||
    ref.sha256 !== hash ||
    !owner ||
    owner.assetId !== ref.assetId ||
    owner.ownerKind !== 'recording' ||
    owner.ownerId !== recordingId ||
    owner.role !== role
  )
    throw new SupersededAssetPublicationError();
}
async function cursorBinding(
  tx: IndexedDbWriteTransaction,
  entry: RecordingTelemetryEntry
): Promise<RecordingCursorTrajectoryWriter | undefined> {
  const descriptor = entry.cursorTrajectory,
    snapshot = entry.cursorTrajectorySnapshot;
  if (!snapshot) return undefined;
  if (!descriptor?.finalized || descriptor.totalBlocks === 0)
    throw new SupersededAssetPublicationError();
  const head: unknown = await tx
    .objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE)
    .get([entry.recordingId, descriptor.trajectoryId]);
  if (
    !isCursorTrajectoryHead(head) ||
    head.recordingId !== entry.recordingId ||
    head.trajectoryId !== descriptor.trajectoryId ||
    head.retired ||
    !head.finalized ||
    head.stagingJournalId !== undefined ||
    head.snapshotAssetId !== snapshot.ref.assetId ||
    head.sourceRecordingId !== snapshot.sourceRecordingId ||
    head.width !== snapshot.width ||
    head.height !== snapshot.height ||
    head.totalBlocks !== descriptor.totalBlocks ||
    head.totalRecords !== descriptor.totalRecords ||
    head.totalSamples !== descriptor.totalSamples ||
    head.totalBytes !== descriptor.totalBytes ||
    head.streamSha256 !== descriptor.streamSha256 ||
    head.state !== descriptor.state
  )
    throw new SupersededAssetPublicationError();
  await assetBinding(
    tx,
    entry.recordingId,
    RECORDING_CURSOR_SNAPSHOT_ROLE,
    snapshot.ref,
    descriptor.totalBytes,
    descriptor.totalBlocks,
    descriptor.streamSha256
  );
  return {
    recordingId: head.recordingId,
    trajectoryId: head.trajectoryId,
    writerGeneration: head.writerGeneration,
  };
}
async function eventsBinding(
  tx: IndexedDbWriteTransaction,
  entry: RecordingTelemetryEntry
): Promise<RecordingEventsWriter | undefined> {
  const descriptor = entry.recordingEvents,
    snapshot = entry.recordingEventsSnapshot;
  if (!snapshot) return undefined;
  if (!descriptor?.finalized || descriptor.totalBlocks === 0)
    throw new SupersededAssetPublicationError();
  const head: unknown = await tx
    .objectStore(RECORDING_EVENTS_STORE)
    .get([entry.recordingId, descriptor.eventStreamId, 'head', 0]);
  if (
    !isRecordingEventsHead(head) ||
    head.recordingId !== entry.recordingId ||
    head.eventStreamId !== descriptor.eventStreamId ||
    head.retired ||
    !head.finalized ||
    head.stagingJournalId !== undefined ||
    head.snapshotAssetId !== snapshot.ref.assetId ||
    head.sourceRecordingId !== snapshot.sourceRecordingId ||
    head.totalBlocks !== descriptor.totalBlocks ||
    head.totalRecords !== descriptor.totalRecords ||
    head.totalBytes !== descriptor.totalBytes ||
    head.streamSha256 !== descriptor.streamSha256 ||
    head.state !== descriptor.state
  )
    throw new SupersededAssetPublicationError();
  await assetBinding(
    tx,
    entry.recordingId,
    RECORDING_EVENTS_SNAPSHOT_ROLE,
    snapshot.ref,
    descriptor.totalBytes,
    descriptor.totalBlocks,
    descriptor.streamSha256
  );
  return {
    recordingId: head.recordingId,
    eventStreamId: head.eventStreamId,
    writerGeneration: head.writerGeneration,
  };
}
async function markPublished(
  tx: IndexedDbWriteTransaction,
  parent: NativeRecordingHistoryParent,
  intent: NativeRecordingHistoryIntent,
  grant: NativeHistoryPublicationGrant
) {
  const next = structuredClone(intent);
  if (grant.kind === 'cursor' && next.cursor) next.cursor.pull = { kind: 'published' };
  else if (grant.kind === 'events' && next.events) next.events.pull = { kind: 'published' };
  else throw new SupersededAssetPublicationError();
  next.phase = [next.cursor, next.events].every(
    (slot) => slot === null || slot.pull?.kind === 'published'
  )
    ? 'complete'
    : 'pending';
  next.revision++;
  next.updatedAt = Math.max(next.updatedAt, Date.now());
  if (!isNativeRecordingHistoryIntent(next)) throw new NativeRecordingHistoryError('invalid');
  await tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE).put({
    ...parent,
    metadata: { ...parent.metadata, history: next },
    updatedAt: Math.max(parent.updatedAt, next.updatedAt),
    expiresAt:
      next.phase === 'complete' ? next.updatedAt + 24 * 60 * 60 * 1000 : Number.MAX_SAFE_INTEGER,
  });
}
async function retirePrivate(tx: IndexedDbWriteTransaction, grant: NativeHistoryPublicationGrant) {
  if (grant.kind === 'cursor' && grant.writer) {
    const head: unknown = await tx
      .objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE)
      .get([grant.writer.recordingId, grant.writer.trajectoryId]);
    if (
      !isCursorTrajectoryHead(head) ||
      head.writerGeneration !== grant.writer.writerGeneration ||
      head.stagingJournalId !== grant.operationId ||
      head.sourceRecordingId !== grant.recordingId
    )
      throw new SupersededAssetPublicationError();
    await retireCursorTrajectoryInTransaction(
      tx,
      grant.writer,
      () => crypto.randomUUID(),
      grant.writer.writerGeneration
    );
  }
  if (grant.kind === 'events' && grant.writer) {
    const head: unknown = await tx
      .objectStore(RECORDING_EVENTS_STORE)
      .get([grant.writer.recordingId, grant.writer.eventStreamId, 'head', 0]);
    if (
      !isRecordingEventsHead(head) ||
      head.writerGeneration !== grant.writer.writerGeneration ||
      head.stagingJournalId !== grant.operationId ||
      head.sourceRecordingId !== grant.recordingId
    )
      throw new SupersededAssetPublicationError();
    await retireRecordingEventsInTransaction(
      tx,
      grant.writer,
      () => crypto.randomUUID(),
      grant.writer.writerGeneration
    );
  }
}
async function assertPrivate(tx: IndexedDbWriteTransaction, grant: NativeHistoryPublicationGrant) {
  if (grant.kind === 'cursor' && grant.writer) {
    const head: unknown = await tx
      .objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE)
      .get([grant.writer.recordingId, grant.writer.trajectoryId]);
    if (
      !isCursorTrajectoryHead(head) ||
      head.retired ||
      !head.finalized ||
      head.writerGeneration !== grant.writer.writerGeneration ||
      head.stagingJournalId !== grant.operationId ||
      head.sourceRecordingId !== grant.recordingId
    )
      throw new SupersededAssetPublicationError();
  }
  if (grant.kind === 'events' && grant.writer) {
    const head: unknown = await tx
      .objectStore(RECORDING_EVENTS_STORE)
      .get([grant.writer.recordingId, grant.writer.eventStreamId, 'head', 0]);
    if (
      !isRecordingEventsHead(head) ||
      head.retired ||
      !head.finalized ||
      head.writerGeneration !== grant.writer.writerGeneration ||
      head.stagingJournalId !== grant.operationId ||
      head.sourceRecordingId !== grant.recordingId
    )
      throw new SupersededAssetPublicationError();
  }
}
type NativeHistoryPublicationResult =
  | { alreadyPublished: true }
  | {
      alreadyPublished: false;
      writer?: RecordingCursorTrajectoryWriter;
      eventsWriter?: RecordingEventsWriter;
    };

/** Runs inside the existing telemetry transaction. Its caller commits metadata and byte owners. */
export async function publishNativeHistoryInTransaction(
  tx: IndexedDbWriteTransaction,
  grant: NativeHistoryPublicationGrant,
  entry: RecordingTelemetryEntry,
  current: RecordingTelemetryEntry | null
): Promise<NativeHistoryPublicationResult> {
  let admitted: Awaited<ReturnType<typeof admitNativeHistoryPublicationInTransaction>>;
  try {
    admitted = await admitNativeHistoryPublicationInTransaction(tx, grant);
  } catch (error) {
    if (error instanceof NativeRecordingHistoryError) throw new SupersededAssetPublicationError();
    throw error;
  }
  const { parent, intent } = admitted;
  if (entry.recordingId !== grant.recordingId) throw new SupersededAssetPublicationError();
  const selected = grant.kind === 'cursor' ? current?.cursorTrajectory : current?.recordingEvents;
  const candidate = grant.kind === 'cursor' ? entry.cursorTrajectory : entry.recordingEvents;
  if (!same(candidate, grant.descriptor)) throw new SupersededAssetPublicationError();
  if (selected && selected.totalBlocks > 0 && !same(selected, grant.descriptor))
    throw new SupersededAssetPublicationError();
  const slot = grant.kind === 'cursor' ? intent.cursor : intent.events;
  if (current && same(selected, grant.descriptor)) {
    const snapshot =
      grant.kind === 'cursor' ? current.cursorTrajectorySnapshot : current.recordingEventsSnapshot;
    if (grant.descriptor.totalBlocks === 0 || snapshot) {
      if (grant.kind === 'cursor') await cursorBinding(tx, current);
      else await eventsBinding(tx, current);
      if (slot?.pull?.kind !== 'published') {
        await retirePrivate(tx, grant);
        await markPublished(tx, parent, intent, grant);
      }
      return { alreadyPublished: true };
    }
  }
  if (slot?.pull?.kind === 'published') throw new SupersededAssetPublicationError();
  await assertPrivate(tx, grant);
  let writer: RecordingCursorTrajectoryWriter | undefined,
    eventsWriter: RecordingEventsWriter | undefined;
  if (grant.kind === 'cursor') {
    if (
      !same(entry.recordingEvents, current?.recordingEvents) &&
      (entry.recordingEvents !== undefined || current?.recordingEvents !== undefined)
    )
      throw new SupersededAssetPublicationError();
    if (
      JSON.stringify(entry.recordingEventsSnapshot) !==
      JSON.stringify(current?.recordingEventsSnapshot)
    )
      throw new SupersededAssetPublicationError();
    if (current) eventsWriter = await eventsBinding(tx, current);
    if (grant.writer) {
      if (
        !entry.cursorTrajectorySnapshot ||
        entry.cursorTrajectorySnapshot.sourceRecordingId !== grant.recordingId ||
        entry.cursorTrajectorySnapshot.width !== grant.width ||
        entry.cursorTrajectorySnapshot.height !== grant.height
      )
        throw new SupersededAssetPublicationError();
      writer = await publishStagedCursorTrajectoryInTransaction({
        tx,
        stagingWriter: grant.writer,
        recordingId: grant.recordingId,
        descriptor: grant.descriptor,
        mintGeneration: () => crypto.randomUUID(),
      });
    } else if (entry.cursorTrajectorySnapshot) throw new SupersededAssetPublicationError();
  } else {
    if (
      !same(entry.cursorTrajectory, current?.cursorTrajectory) &&
      (entry.cursorTrajectory !== undefined || current?.cursorTrajectory !== undefined)
    )
      throw new SupersededAssetPublicationError();
    if (
      JSON.stringify(entry.cursorTrajectorySnapshot) !==
      JSON.stringify(current?.cursorTrajectorySnapshot)
    )
      throw new SupersededAssetPublicationError();
    if (current) writer = await cursorBinding(tx, current);
    if (grant.writer) {
      if (
        !entry.recordingEventsSnapshot ||
        entry.recordingEventsSnapshot.sourceRecordingId !== grant.recordingId
      )
        throw new SupersededAssetPublicationError();
      eventsWriter = await publishStagedRecordingEventsInTransaction({
        tx,
        stagingWriter: grant.writer,
        recordingId: grant.recordingId,
        descriptor: grant.descriptor,
        mintGeneration: () => crypto.randomUUID(),
      });
    } else if (entry.recordingEventsSnapshot) throw new SupersededAssetPublicationError();
  }
  await markPublished(tx, parent, intent, grant);
  return {
    alreadyPublished: false,
    ...(writer ? { writer } : {}),
    ...(eventsWriter ? { eventsWriter } : {}),
  };
}

/** Reconstructs receipt facts from the committed source, head, byte owner and metadata ledger. */
export async function readPublishedNativeHistory(recordingId: string, kind: 'cursor' | 'events') {
  const intent = await createNativeRecordingHistoryStore().read(recordingId);
  if (!intent) throw new SupersededAssetPublicationError();
  const grant = createNativeHistoryPublicationGrant(intent, kind);
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        STORE_NAME,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        NATIVE_TRANSFER_SESSIONS_STORE,
        RECORDING_CURSOR_TRAJECTORIES_STORE,
        RECORDING_EVENTS_STORE,
        RECORDING_TELEMETRY_STORE,
      ],
      'readwrite'
    );
    try {
      const admitted = await admitNativeHistoryPublicationInTransaction(tx, grant);
      const slot = kind === 'cursor' ? admitted.intent.cursor : admitted.intent.events;
      if (slot?.pull?.kind !== 'published') throw new SupersededAssetPublicationError();
      const entry = parseRecordingTelemetryEntry(
        await tx.objectStore(RECORDING_TELEMETRY_STORE).get(recordingId)
      );
      if (
        !entry ||
        !same(kind === 'cursor' ? entry.cursorTrajectory : entry.recordingEvents, grant.descriptor)
      )
        throw new SupersededAssetPublicationError();
      if (grant.kind === 'cursor') await cursorBinding(tx, entry);
      else await eventsBinding(tx, entry);
      if (
        grant.descriptor.totalBlocks > 0 &&
        !(grant.kind === 'cursor' ? entry.cursorTrajectorySnapshot : entry.recordingEventsSnapshot)
      )
        throw new SupersededAssetPublicationError();
      await tx.done;
      if (grant.descriptor.totalBlocks === 0) return null;
      return grant.kind === 'cursor'
        ? { kind: 'cursor' as const, descriptor: grant.descriptor }
        : { kind: 'events' as const, descriptor: grant.descriptor };
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}
