import { admitStoredCursorTrajectoryBlock as admitBlock } from './guards';
import { sha256 } from '@noble/hashes/sha2.js';
import { retireCursorTrajectoryInTransaction } from './retirement';
import type { IDBPDatabase } from 'idb';
import { type PackedCursorTrajectoryBlock } from '../../../../features/video/project/cursor-trajectory/blocks';
import {
  isTrajectoryInteger,
  trajectoryRecordTimes,
} from '../../../../features/video/project/cursor-trajectory/records';
import type { CursorTrajectorySegment } from '../../../../features/video/project/cursor-trajectory/types';
import { runWithPersistenceMutationPermit } from '../../infrastructure/mutation-barrier';
import { abortIndexedDbMutation } from '../../infrastructure/indexed-db/transaction';
import {
  RECORDING_CURSOR_TRAJECTORIES_STORE as HEADS,
  RECORDING_CURSOR_BLOCKS_STORE as BLOCKS,
} from '../../infrastructure/indexed-db/core.stores';
import {
  isCursorTrajectoryEntry,
  isCursorTrajectoryHead,
  isCursorTrajectoryIdentity,
  isCursorTrajectoryTotals,
} from './guards';
import {
  RecordingCursorTrajectoryError,
  type RecordingCursorTrajectoryHead,
  type RecordingCursorTrajectoryIdentity,
  type RecordingCursorTrajectoryStoreDependencies,
  type RecordingCursorTrajectoryTotals,
  type RecordingCursorTrajectoryWriter,
  type StoredRecordingCursorBlock,
} from './contracts';

const totalKeys = [
  'totalBlocks',
  'totalRecords',
  'totalSamples',
  'totalBytes',
  'streamSha256',
] as const;
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const emptyDigest = hex(sha256(new Uint8Array()));
const key = (identity: RecordingCursorTrajectoryIdentity) => [
  identity.recordingId,
  identity.trajectoryId,
];
const range = (identity: RecordingCursorTrajectoryIdentity, from = 0) =>
  IDBKeyRange.bound([...key(identity), from], [...key(identity), Number.MAX_SAFE_INTEGER]);

function identityValid(identity: RecordingCursorTrajectoryIdentity): void {
  if (!isCursorTrajectoryIdentity(identity)) throw new RecordingCursorTrajectoryError('invalid');
}

function headFrom(
  raw: unknown,
  identity: RecordingCursorTrajectoryIdentity
): RecordingCursorTrajectoryHead | null {
  if (raw === undefined) return null;
  if (
    !isCursorTrajectoryHead(raw) ||
    raw.recordingId !== identity.recordingId ||
    raw.trajectoryId !== identity.trajectoryId
  )
    throw new RecordingCursorTrajectoryError('integrity');
  return raw;
}

function requireWriter(
  head: RecordingCursorTrajectoryHead | null,
  writer: RecordingCursorTrajectoryWriter
): RecordingCursorTrajectoryHead {
  if (!head) throw new RecordingCursorTrajectoryError('missing');
  if (head.retired) throw new RecordingCursorTrajectoryError('retired');
  if (head.writerGeneration !== writer.writerGeneration)
    throw new RecordingCursorTrajectoryError('stale-writer');
  return head;
}

function totalsEqual(
  left: RecordingCursorTrajectoryTotals,
  right: RecordingCursorTrajectoryTotals
): boolean {
  return totalKeys.every((name) => left[name] === right[name]);
}

/** One durable authority for block appends, retirement, restore and finalized stream integrity. */
export function createRecordingCursorTrajectoryStore(
  dependencies: RecordingCursorTrajectoryStoreDependencies
) {
  const mutate = <T>(operation: (db: IDBPDatabase) => Promise<T>) =>
    dependencies.database().then((db) => runWithPersistenceMutationPermit(() => operation(db)));
  const openWriter = (
    identity: RecordingCursorTrajectoryIdentity,
    geometry: { width: number; height: number },
    restore: boolean,
    sourceRecordingId: string,
    stagingJournalId?: string
  ) => {
    identityValid(identity);
    if (
      typeof sourceRecordingId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(sourceRecordingId) ||
      (stagingJournalId !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(stagingJournalId))
    )
      throw new RecordingCursorTrajectoryError('invalid');
    identity = keyIdentity(identity);
    geometry = { ...geometry };
    if (
      ![geometry.width, geometry.height].every(
        (size) => isTrajectoryInteger(size) && size > 0 && size <= 0xffffffff
      )
    )
      throw new RecordingCursorTrajectoryError('invalid');
    return mutate(async (db) => {
      const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
      try {
        const store = tx.objectStore(HEADS);
        const old = headFrom(await store.get(key(identity)), identity);
        if (old && !restore) {
          if (old.retired) throw new RecordingCursorTrajectoryError('retired');
          if (old.finalized) throw new RecordingCursorTrajectoryError('finalized');
          throw new RecordingCursorTrajectoryError('conflict');
        }
        if (restore && (!old || !old.retired)) throw new RecordingCursorTrajectoryError('conflict');
        const writerGeneration = dependencies.mintGeneration();
        if (
          !/^[A-Za-z0-9._:-]{1,128}$/.test(writerGeneration) ||
          writerGeneration === old?.writerGeneration
        )
          throw new RecordingCursorTrajectoryError('invalid');
        if (restore) await tx.objectStore(BLOCKS).delete(range(identity));
        const head: RecordingCursorTrajectoryHead = {
          ...identity,
          ...geometry,
          sourceRecordingId,
          ...(stagingJournalId !== undefined ? { stagingJournalId } : {}),
          writerGeneration,
          revision: (old?.revision ?? 0) + 1,
          retired: false,
          finalized: false,
          state: 'incomplete',
          totalBlocks: 0,
          totalRecords: 0,
          totalSamples: 0,
          totalBytes: 0,
          streamSha256: emptyDigest,
          activeSegment: null,
          lastObservationSeq: null,
          lastSegmentId: null,
          lastTimeUs: 0,
        };
        await store.put(head);
        await tx.done;
        return { ...identity, writerGeneration };
      } catch (error) {
        return abortIndexedDbMutation(tx, error);
      }
    });
  };
  return {
    begin: (
      identity: RecordingCursorTrajectoryIdentity,
      geometry: { width: number; height: number },
      sourceRecordingId = identity.recordingId,
      stagingJournalId?: string
    ) => openWriter(identity, geometry, false, sourceRecordingId, stagingJournalId),
    restore: (
      identity: RecordingCursorTrajectoryIdentity,
      geometry: { width: number; height: number },
      sourceRecordingId = identity.recordingId,
      stagingJournalId?: string
    ) => openWriter(identity, geometry, true, sourceRecordingId, stagingJournalId),

    async append(
      writer: RecordingCursorTrajectoryWriter,
      packed: PackedCursorTrajectoryBlock
    ): Promise<void> {
      identityValid(writer);
      writer = structuredClone(writer);
      const entry = structuredClone(packed.entry);
      const bytes = packed.bytes.slice();
      if (
        !isCursorTrajectoryEntry(entry) ||
        bytes.byteLength !== entry.byteLength ||
        hex(sha256(bytes)) !== entry.blockSha256
      )
        throw new RecordingCursorTrajectoryError('integrity');
      return mutate(async (db) => {
        const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
        try {
          const headStore = tx.objectStore(HEADS);
          const head = requireWriter(headFrom(await headStore.get(key(writer)), writer), writer);
          const blockStore = tx.objectStore(BLOCKS);
          if (entry.sequence < head.totalBlocks) {
            const { row } = admitBlock(
              await blockStore.get([...key(writer), entry.sequence]),
              head
            );
            if (
              Object.keys(entry).some((name) => !Object.hasOwn(row.entry, name)) ||
              JSON.stringify(Object.entries(entry).sort()) !==
                JSON.stringify(Object.entries(row.entry).sort()) ||
              !bytes.every((byte, index) => byte === row.bytes[index])
            )
              throw new RecordingCursorTrajectoryError('conflict');
            await tx.done;
            return;
          }
          if (head.finalized) throw new RecordingCursorTrajectoryError('finalized');
          if (entry.sequence !== head.totalBlocks)
            throw new RecordingCursorTrajectoryError('conflict');
          const row: StoredRecordingCursorBlock = {
            ...keyIdentity(writer),
            sequence: entry.sequence,
            startTimeUs: entry.startTimeUs,
            entry,
            bytes,
            initialSegment: head.activeSegment,
          };
          const { block } = admitBlock(row, head);
          const next = structuredClone(head);
          for (const record of block.records) {
            const [from, to] = trajectoryRecordTimes(record);
            if (from < next.lastTimeUs) throw new RecordingCursorTrajectoryError('integrity');
            next.lastTimeUs = to;
            if (record.kind === 'segment') {
              if (
                next.activeSegment ||
                record.width !== head.width ||
                record.height !== head.height ||
                (next.lastSegmentId === null
                  ? record.segmentId !== 0
                  : record.segmentId <= next.lastSegmentId)
              )
                throw new RecordingCursorTrajectoryError('integrity');
              next.activeSegment = record;
              next.lastSegmentId = record.segmentId;
            }
            if (record.kind === 'sample') {
              if (
                next.lastObservationSeq !== null &&
                record.observationSeq <= next.lastObservationSeq
              )
                throw new RecordingCursorTrajectoryError('integrity');
              next.lastObservationSeq = record.observationSeq;
            }
            if (record.kind === 'gap' || record.kind === 'boundary') next.activeSegment = null;
          }
          next.totalBlocks += 1;
          next.totalRecords += entry.recordCount;
          next.totalSamples += entry.sampleCount;
          next.totalBytes += entry.byteLength;
          next.streamSha256 = entry.prefixSha256;
          next.revision += 1;
          if (!isCursorTrajectoryHead(next)) throw new RecordingCursorTrajectoryError('invalid');
          await blockStore.add(row);
          await headStore.put(next);
          await tx.done;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },

    async finalize(
      writer: RecordingCursorTrajectoryWriter,
      expected: RecordingCursorTrajectoryTotals,
      state: 'complete' | 'incomplete' | 'unavailable'
    ): Promise<RecordingCursorTrajectoryHead> {
      identityValid(writer);
      writer = structuredClone(writer);
      if (
        !isCursorTrajectoryTotals(expected) ||
        !['complete', 'incomplete', 'unavailable'].includes(state)
      )
        throw new RecordingCursorTrajectoryError('invalid');
      const declared = structuredClone(expected);
      const db = await dependencies.database();
      const read = db.transaction([HEADS, BLOCKS], 'readonly');
      void read.done.catch(() => undefined);
      const head = requireWriter(
        headFrom(await read.objectStore(HEADS).get(key(writer)), writer),
        writer
      );
      if (head.finalized) {
        await read.done;
        if (head.state !== state || !totalsEqual(head, declared))
          throw new RecordingCursorTrajectoryError('conflict');
        return head;
      }
      const digest = sha256.create();
      const actual = {
        totalBlocks: 0,
        totalRecords: 0,
        totalSamples: 0,
        totalBytes: 0,
        streamSha256: emptyDigest,
      };
      let segment: CursorTrajectorySegment | null = null;
      let hasGap = false;
      let cursor = await read.objectStore(BLOCKS).openCursor(range(writer));
      while (cursor) {
        const { row, block } = admitBlock(cursor.value, head);
        if (
          row.sequence !== actual.totalBlocks ||
          JSON.stringify(row.initialSegment) !== JSON.stringify(segment)
        )
          throw new RecordingCursorTrajectoryError('integrity');
        const prefix = new Uint8Array(4);
        new DataView(prefix.buffer).setUint32(0, row.bytes.byteLength, true);
        digest.update(prefix).update(row.bytes);
        if (hex(digest.clone().digest()) !== row.entry.prefixSha256)
          throw new RecordingCursorTrajectoryError('integrity');
        for (const record of block.records) {
          if (record.kind === 'gap') hasGap = true;
          if (record.kind === 'segment') segment = record;
          if (record.kind === 'boundary' || record.kind === 'gap') segment = null;
        }
        actual.totalBlocks += 1;
        actual.totalRecords += row.entry.recordCount;
        actual.totalSamples += row.entry.sampleCount;
        actual.totalBytes += row.bytes.byteLength;
        cursor = await cursor.continue();
      }
      actual.streamSha256 = hex(digest.digest());
      await read.done;
      if (
        !totalsEqual(actual, declared) ||
        !totalsEqual(head, actual) ||
        (state === 'unavailable' && actual.totalBlocks !== 0) ||
        (state === 'complete' && (segment !== null || hasGap))
      )
        throw new RecordingCursorTrajectoryError('integrity');
      return mutate(async (database) => {
        const tx = database.transaction(HEADS, 'readwrite');
        try {
          const current = requireWriter(headFrom(await tx.store.get(key(writer)), writer), writer);
          if (current.finalized && current.state === state && totalsEqual(current, declared)) {
            await tx.done;
            return current;
          }
          if (current.revision !== head.revision)
            throw new RecordingCursorTrajectoryError('conflict');
          const finalized = { ...current, finalized: true, state, revision: current.revision + 1 };
          await tx.store.put(finalized);
          await tx.done;
          return finalized;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },

    async retire(
      identity: RecordingCursorTrajectoryIdentity,
      expectedGeneration?: string
    ): Promise<void> {
      identityValid(identity);
      identity = keyIdentity(identity);
      return mutate(async (db) => {
        const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
        try {
          await retireCursorTrajectoryInTransaction(
            tx,
            identity,
            dependencies.mintGeneration,
            expectedGeneration
          );
          await tx.done;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },

    async getHead(
      identity: RecordingCursorTrajectoryIdentity
    ): Promise<RecordingCursorTrajectoryHead | null> {
      identityValid(identity);
      identity = keyIdentity(identity);
      const db = await dependencies.database();
      const head = headFrom(await db.get(HEADS, key(identity)), identity);
      return head?.retired ? null : head;
    },

    async manifestPage(identity: RecordingCursorTrajectoryIdentity, fromSequence: number) {
      identityValid(identity);
      identity = keyIdentity(identity);
      if (!isTrajectoryInteger(fromSequence)) throw new RecordingCursorTrajectoryError('invalid');
      const db = await dependencies.database();
      const tx = db.transaction([HEADS, BLOCKS], 'readonly');
      void tx.done.catch(() => undefined);
      const head = headFrom(await tx.objectStore(HEADS).get(key(identity)), identity);
      if (!head || head.retired) {
        await tx.done;
        return [];
      }
      const entries = [];
      let cursor = await tx.objectStore(BLOCKS).openCursor(range(identity, fromSequence));
      while (cursor && entries.length < 32) {
        const { row } = admitBlock(cursor.value, head);
        entries.push(row.entry);
        cursor = await cursor.continue();
      }
      await tx.done;
      return entries;
    },

    async readBlock(
      identity: RecordingCursorTrajectoryIdentity,
      sequence: number,
      expectedGeneration?: string
    ): Promise<StoredRecordingCursorBlock | null> {
      identityValid(identity);
      identity = keyIdentity(identity);
      if (!isTrajectoryInteger(sequence)) throw new RecordingCursorTrajectoryError('invalid');
      const db = await dependencies.database();
      const tx = db.transaction([HEADS, BLOCKS], 'readonly');
      void tx.done.catch(() => undefined);
      const head = headFrom(await tx.objectStore(HEADS).get(key(identity)), identity);
      if (expectedGeneration !== undefined)
        requireWriter(head, { ...identity, writerGeneration: expectedGeneration });
      const raw: unknown =
        head && !head.retired
          ? await tx.objectStore(BLOCKS).get([...key(identity), sequence])
          : undefined;
      const row = raw === undefined ? null : admitBlock(raw, head!).row;
      await tx.done;
      return row;
    },

    /** One time-index seek and at most three blocks suffice for adjacent interpolation anchors. */
    async readWindow(identity: RecordingCursorTrajectoryIdentity, activeTimeUs: number) {
      identityValid(identity);
      identity = keyIdentity(identity);
      if (!isTrajectoryInteger(activeTimeUs)) throw new RecordingCursorTrajectoryError('invalid');
      const db = await dependencies.database();
      const tx = db.transaction([HEADS, BLOCKS], 'readonly');
      void tx.done.catch(() => undefined);
      const head = headFrom(await tx.objectStore(HEADS).get(key(identity)), identity);
      if (!head || head.retired) {
        await tx.done;
        return null;
      }
      const blocks = tx.objectStore(BLOCKS);
      const timeRange = IDBKeyRange.bound(
        [...key(identity), 0, 0],
        [...key(identity), activeTimeUs, Number.MAX_SAFE_INTEGER]
      );
      const cursor = await blocks.index('time').openCursor(timeRange, 'prev');
      const current = cursor ? admitBlock(cursor.value, head).row : null;
      const sequence = current?.sequence ?? 0;
      const rows: StoredRecordingCursorBlock[] = [];
      for (
        let index = Math.max(0, sequence - 1);
        index <= Math.min(sequence + 1, head.totalBlocks - 1);
        index++
      ) {
        const raw: unknown = await blocks.get([...key(identity), index]);
        if (raw === undefined) throw new RecordingCursorTrajectoryError('missing');
        rows.push(admitBlock(raw, head).row);
      }
      const next = rows.find((row) => row.sequence === sequence + 1);
      const fromTimeUs = current?.startTimeUs ?? 0;
      const toTimeUs = current ? (next?.startTimeUs ?? null) : (rows[0]?.startTimeUs ?? null);
      await tx.done;
      return { head, blocks: rows, fromTimeUs, toTimeUs };
    },
  };
}

function keyIdentity(
  identity: RecordingCursorTrajectoryIdentity
): RecordingCursorTrajectoryIdentity {
  return { recordingId: identity.recordingId, trajectoryId: identity.trajectoryId };
}
