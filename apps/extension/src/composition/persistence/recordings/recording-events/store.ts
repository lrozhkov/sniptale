import { sha256 } from '@noble/hashes/sha2.js';
import type { IDBPDatabase } from 'idb';
import type { PackedRecordingEventsBlock } from '../../../../features/video/project/recording-events/blocks';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import { createRecordingEventsStreamSink } from '../../../../features/video/project/recording-events/stream';
import { isTrajectoryInteger } from '../../../../features/video/project/cursor-trajectory/records';
import { RECORDING_EVENTS_STORE as STORE } from '../../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../../infrastructure/mutation-barrier';
import { abortIndexedDbMutation } from '../../infrastructure/indexed-db/transaction';
import {
  RecordingEventsError,
  type RecordingEventsHead,
  type RecordingEventsIdentity,
  type RecordingEventsStoreDependencies,
  type RecordingEventsWriter,
} from './contracts';
import {
  RECORDING_EVENTS_EMPTY_SHA256,
  admitStoredRecordingEventsBlock,
  isRecordingEventsHead,
  isRecordingEventsRootFence,
  recordingEventsRootFenceKey,
  isRecordingEventsIdentity,
  isRecordingEventsManifestEntry,
  recordingEventsHex,
  recordingEventsIdentifier,
} from './guards';
import { applyRecordingEventFact } from './facts';

const identityKey = (identity: RecordingEventsIdentity) => [
  identity.recordingId,
  identity.eventStreamId,
];
const headKey = (identity: RecordingEventsIdentity) => [...identityKey(identity), 'head', 0];
const blockRange = (identity: RecordingEventsIdentity) =>
  IDBKeyRange.bound(
    [...identityKey(identity), 'block', 0],
    [...identityKey(identity), 'block', Number.MAX_SAFE_INTEGER]
  );
const totals = ['totalBlocks', 'totalRecords', 'totalBytes', 'streamSha256'] as const;
const manifestFields = [
  'sequence',
  'startTimeUs',
  'endTimeUs',
  'recordCount',
  'byteLength',
  'blockSha256',
  'prefixSha256',
] as const;
function identityValid(identity: RecordingEventsIdentity): void {
  if (!isRecordingEventsIdentity(identity)) throw new RecordingEventsError('invalid');
}
function headFrom(raw: unknown, identity: RecordingEventsIdentity): RecordingEventsHead {
  if (raw === undefined) throw new RecordingEventsError('missing');
  if (
    !isRecordingEventsHead(raw) ||
    raw.recordingId !== identity.recordingId ||
    raw.eventStreamId !== identity.eventStreamId
  )
    throw new RecordingEventsError('integrity');
  return raw;
}
function requireWriter(
  head: RecordingEventsHead,
  writer: RecordingEventsWriter
): RecordingEventsHead {
  if (head.retired) throw new RecordingEventsError('retired');
  if (head.writerGeneration !== writer.writerGeneration)
    throw new RecordingEventsError('stale-writer');
  return head;
}
function newHead(
  identity: RecordingEventsIdentity,
  generation: string,
  revision: number,
  sourceRecordingId: string,
  stagingJournalId?: string
): RecordingEventsHead {
  const head: RecordingEventsHead = {
    ...identity,
    kind: 'head',
    entryId: 0,
    writerGeneration: generation,
    revision,
    sourceRecordingId,
    retired: false,
    finalized: false,
    state: 'incomplete',
    activeSegment: null,
    lastSegmentId: null,
    hasGap: false,
    activeInputs: 0,
    totalBlocks: 0,
    totalRecords: 0,
    totalBytes: 0,
    streamSha256: RECORDING_EVENTS_EMPTY_SHA256,
    ...(stagingJournalId === undefined ? {} : { stagingJournalId }),
  };
  if (!isRecordingEventsHead(head)) throw new RecordingEventsError('invalid');
  return head;
}

/** The runtime supplies admission. Each append owns one atomic block/head/fact transaction. */
export function createRecordingEventsStore(dependencies: RecordingEventsStoreDependencies) {
  const mutate = <T>(operation: (db: IDBPDatabase) => Promise<T>) =>
    dependencies.database().then((db) => runWithPersistenceMutationPermit(() => operation(db)));
  async function open(
    identity: RecordingEventsIdentity,
    restore: boolean,
    sourceRecordingId = identity.recordingId,
    stagingJournalId?: string
  ): Promise<RecordingEventsWriter> {
    identityValid(identity);
    identity = { ...identity };
    if (
      !recordingEventsIdentifier(sourceRecordingId) ||
      (stagingJournalId !== undefined && !recordingEventsIdentifier(stagingJournalId))
    )
      throw new RecordingEventsError('invalid');
    return mutate(async (db) => {
      const tx = db.transaction(STORE, 'readwrite');
      try {
        const fence: unknown = await tx.store.get(
          recordingEventsRootFenceKey(identity.recordingId)
        );
        if (fence !== undefined) {
          if (!isRecordingEventsRootFence(fence, identity.recordingId))
            throw new RecordingEventsError('integrity');
          if (!restore) throw new RecordingEventsError('retired');
        }
        const raw: unknown = await tx.store.get(headKey(identity));
        let revision = 1;
        if (raw !== undefined) {
          const previous = headFrom(raw, identity);
          if (!restore) {
            if (previous.retired) throw new RecordingEventsError('retired');
            if (previous.finalized) throw new RecordingEventsError('finalized');
            throw new RecordingEventsError('conflict');
          }
          if (!previous.retired) throw new RecordingEventsError('conflict');
          revision = previous.revision + 1;
        } else if (restore) throw new RecordingEventsError('missing');
        const head = newHead(
          identity,
          dependencies.mintGeneration(),
          revision,
          sourceRecordingId,
          stagingJournalId
        );
        if (isRecordingEventsHead(raw) && head.writerGeneration === raw.writerGeneration)
          throw new RecordingEventsError('invalid');
        await tx.store.put(head);
        await tx.done;
        return { ...identity, writerGeneration: head.writerGeneration };
      } catch (error) {
        return abortIndexedDbMutation(tx, error);
      }
    });
  }
  return {
    begin: (
      identity: RecordingEventsIdentity,
      sourceRecordingId?: string,
      stagingJournalId?: string
    ) => open(identity, false, sourceRecordingId, stagingJournalId),
    restore: (
      identity: RecordingEventsIdentity,
      sourceRecordingId?: string,
      stagingJournalId?: string
    ) => open(identity, true, sourceRecordingId, stagingJournalId),
    async getHead(identity: RecordingEventsIdentity): Promise<RecordingEventsHead | null> {
      identityValid(identity);
      identity = { ...identity };
      const db = await dependencies.database();
      const raw: unknown = await db.get(STORE, headKey(identity));
      if (raw === undefined) return null;
      const head = headFrom(raw, identity);
      return head.retired ? null : head;
    },
    async append(writer: RecordingEventsWriter, packed: PackedRecordingEventsBlock): Promise<void> {
      identityValid(writer);
      writer = structuredClone(writer);
      const entry = structuredClone(packed.entry);
      const bytes = packed.bytes.slice();
      if (
        !isRecordingEventsManifestEntry(entry) ||
        bytes.byteLength !== entry.byteLength ||
        recordingEventsHex(sha256(bytes)) !== entry.blockSha256
      )
        throw new RecordingEventsError('integrity');
      await mutate(async (db) => {
        const tx = db.transaction(STORE, 'readwrite');
        try {
          const head = requireWriter(headFrom(await tx.store.get(headKey(writer)), writer), writer);
          const row = {
            recordingId: writer.recordingId,
            eventStreamId: writer.eventStreamId,
            kind: 'block',
            entryId: entry.sequence,
            entry,
            bytes,
          };
          const { block } = admitStoredRecordingEventsBlock(row, head);
          if (entry.sequence < head.totalBlocks) {
            const previous = admitStoredRecordingEventsBlock(
              await tx.store.get([...identityKey(writer), 'block', entry.sequence]),
              head
            ).row;
            if (
              !manifestFields.every((key) => previous.entry[key] === entry[key]) ||
              !bytes.every((byte, index) => byte === previous.bytes[index])
            )
              throw new RecordingEventsError('conflict');
            await tx.done;
            return;
          }
          if (head.finalized) throw new RecordingEventsError('finalized');
          if (entry.sequence !== head.totalBlocks) throw new RecordingEventsError('conflict');
          const next = structuredClone(head);
          for (const record of block.records) {
            if (record.recordSeq !== next.totalRecords) throw new RecordingEventsError('integrity');
            if (record.kind === 'segment') {
              if (
                next.activeSegment !== null ||
                (next.lastSegmentId === null
                  ? record.segmentId !== 0
                  : record.segmentId <= next.lastSegmentId)
              )
                throw new RecordingEventsError('integrity');
              next.activeSegment = record.segmentId;
              next.lastSegmentId = record.segmentId;
            } else if (next.activeSegment === null || record.segmentId !== next.activeSegment)
              throw new RecordingEventsError('integrity');
            next.activeInputs += await applyRecordingEventFact(tx.store, writer, record);
            if (!isTrajectoryInteger(next.activeInputs))
              throw new RecordingEventsError('integrity');
            if (record.kind === 'gap') next.hasGap = true;
            if (record.kind === 'gap' || record.kind === 'boundary') next.activeSegment = null;
            next.totalRecords++;
          }
          next.totalBlocks++;
          next.totalBytes += entry.byteLength;
          next.streamSha256 = entry.prefixSha256;
          next.revision++;
          if (!isRecordingEventsHead(next)) throw new RecordingEventsError('invalid');
          await tx.store.add(row);
          await tx.store.put(next);
          await tx.done;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },
    async finalize(
      writer: RecordingEventsWriter,
      rawDescriptor: unknown
    ): Promise<RecordingEventsHead> {
      identityValid(writer);
      writer = structuredClone(writer);
      const descriptor = structuredClone(rawDescriptor);
      if (
        !isRecordingEventsDescriptor(descriptor) ||
        !descriptor.finalized ||
        descriptor.eventStreamId !== writer.eventStreamId
      )
        throw new RecordingEventsError('invalid');
      const db = await dependencies.database();
      const read = db.transaction(STORE, 'readonly');
      void read.done.catch(() => undefined);
      const head = requireWriter(headFrom(await read.store.get(headKey(writer)), writer), writer);
      if (head.finalized) {
        await read.done;
        if (
          head.state !== descriptor.state ||
          !totals.every((key) => head[key] === descriptor[key])
        )
          throw new RecordingEventsError('conflict');
        return head;
      }
      let expectedPrefix: string | null = null;
      const input = createRecordingEventsStreamSink(
        { sourceRecordingId: head.sourceRecordingId, descriptor },
        async (block) => {
          if (block.entry.prefixSha256 !== expectedPrefix)
            throw new RecordingEventsError('integrity');
        }
      ).getWriter();
      try {
        let cursor = await read.store.openCursor(blockRange(writer));
        while (cursor) {
          const { row } = admitStoredRecordingEventsBlock(cursor.value, head);
          const prefix = new Uint8Array(4);
          new DataView(prefix.buffer).setUint32(0, row.bytes.byteLength, true);
          expectedPrefix = row.entry.prefixSha256;
          await input.write(prefix);
          await input.write(row.bytes);
          cursor = await cursor.continue();
        }
        await input.close();
        await read.done;
      } catch (error) {
        await input.abort(error).catch(() => undefined);
        throw error;
      } finally {
        input.releaseLock();
      }
      if (!totals.every((key) => head[key] === descriptor[key]))
        throw new RecordingEventsError('integrity');
      return mutate(async (database) => {
        const tx = database.transaction(STORE, 'readwrite');
        try {
          const current = requireWriter(
            headFrom(await tx.store.get(headKey(writer)), writer),
            writer
          );
          if (current.revision !== head.revision) throw new RecordingEventsError('conflict');
          const next = {
            ...current,
            revision: current.revision + 1,
            finalized: true,
            state: descriptor.state,
          };
          if (!isRecordingEventsHead(next)) throw new RecordingEventsError('integrity');
          await tx.store.put(next);
          await tx.done;
          return next;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },
    async readBlock(
      identity: RecordingEventsIdentity,
      sequence: number,
      expectedGeneration?: string
    ): Promise<PackedRecordingEventsBlock | null> {
      identityValid(identity);
      identity = { ...identity };
      if (!isTrajectoryInteger(sequence)) throw new RecordingEventsError('invalid');
      const db = await dependencies.database();
      const tx = db.transaction(STORE, 'readonly');
      void tx.done.catch(() => undefined);
      const raw: unknown = await tx.store.get(headKey(identity));
      if (raw === undefined || headFrom(raw, identity).retired) {
        await tx.done;
        return null;
      }
      const head = headFrom(raw, identity);
      if (expectedGeneration !== undefined && head.writerGeneration !== expectedGeneration)
        throw new RecordingEventsError('stale-writer');
      const row: unknown = await tx.store.get([...identityKey(identity), 'block', sequence]);
      await tx.done;
      if (row === undefined) return null;
      const admitted = admitStoredRecordingEventsBlock(row, head).row;
      return { bytes: admitted.bytes, entry: admitted.entry };
    },
    async retire(identity: RecordingEventsIdentity, expectedGeneration?: string): Promise<void> {
      identityValid(identity);
      identity = { ...identity };
      await mutate(async (db) => {
        const tx = db.transaction(STORE, 'readwrite');
        try {
          const raw: unknown = await tx.store.get(headKey(identity));
          const head =
            raw === undefined
              ? newHead(identity, dependencies.mintGeneration(), 1, identity.recordingId)
              : headFrom(raw, identity);
          if (expectedGeneration !== undefined && head.writerGeneration !== expectedGeneration)
            throw new RecordingEventsError('stale-writer');
          if (!head.retired) {
            const next = { ...head, retired: true, revision: head.revision + 1 };
            if (!isRecordingEventsHead(next)) throw new RecordingEventsError('invalid');
            await tx.store.put(next);
          }
          await tx.store.delete(
            IDBKeyRange.bound(
              [...identityKey(identity), 'block'],
              [...identityKey(identity), 'head'],
              false,
              true
            )
          );
          await tx.done;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },
  };
}
