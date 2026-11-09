import { compareIndexedDbKeys } from '../../infrastructure/indexed-db/core';
import { createRecordingEventsStreamSource } from '../../../../features/video/project/recording-events/stream';
import type { createRecordingEventsStore } from './store';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isTrajectoryInteger } from '../../../../features/video/project/cursor-trajectory/records';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import { RECORDING_EVENTS_STORE as STORE } from '../../infrastructure/indexed-db/core.stores';
import {
  RecordingEventsError,
  type RecordingEventsIdentity,
  type RecordingEventsStoreDependencies,
  type StoredRecordingEventFact,
  type RecordingEventsHead,
} from './contracts';
import {
  isRecordingEventsHead,
  isRecordingEventsIdentity,
  recordingEventsIdentifier,
} from './guards';
import { admitStoredRecordingEventFact } from './facts';
import {
  firstRecordingEventIntervalMatch,
  recordingEventIntervalBuckets,
  recordingEventIntervalQuery,
} from './interval-index';

export const RECORDING_EVENTS_FACT_PAGE_SIZE = 128;
const MAX_SCANNED_ROWS = 512;
/** A read continuation binds one immutable source and one inclusive time range. */
export interface RecordingEventsFactCursor extends RecordingEventsIdentity {
  writerGeneration: string;
  streamSha256: string;
  fromTimeUs: number;
  toTimeUs: number;
  level: number;
  index: number;
  entryId: string;
}
export interface RecordingEventsFactPage {
  writerGeneration: string;
  facts: StoredRecordingEventFact[];
  next: RecordingEventsFactCursor | null;
}
function continuation(
  raw: unknown,
  identity: RecordingEventsIdentity,
  digest: string,
  from: number,
  to: number
): RecordingEventsFactCursor | undefined {
  if (raw === undefined) return undefined;
  if (
    !isPlainRecord(raw) ||
    Object.keys(raw).length !== 9 ||
    !isRecordingEventsIdentity(raw) ||
    raw['recordingId'] !== identity.recordingId ||
    raw['eventStreamId'] !== identity.eventStreamId ||
    raw['streamSha256'] !== digest ||
    raw['fromTimeUs'] !== from ||
    raw['toTimeUs'] !== to ||
    !recordingEventsIdentifier(raw['writerGeneration']) ||
    !isTrajectoryInteger(raw['level']) ||
    raw['level'] > 53 ||
    !isTrajectoryInteger(raw['index']) ||
    typeof raw['entryId'] !== 'string' ||
    raw['entryId'].length < 3 ||
    raw['entryId'].length > 130
  )
    throw new RecordingEventsError('invalid');
  const scale = 2 ** raw['level'];
  if (raw['index'] < Math.floor(from / scale) || raw['index'] > Math.floor(to / scale))
    throw new RecordingEventsError('invalid');
  return {
    ...identity,
    writerGeneration: raw['writerGeneration'],
    streamSha256: digest,
    fromTimeUs: from,
    toTimeUs: to,
    level: raw['level'],
    index: raw['index'],
    entryId: raw['entryId'],
  };
}

/** A page reads bounded derived facts. It never loads complete source blocks or changes storage. */
export function createRecordingEventsReader(
  dependencies: Pick<RecordingEventsStoreDependencies, 'database'>
) {
  return {
    async readPage(args: {
      identity: RecordingEventsIdentity;
      descriptor: unknown;
      fromTimeUs: number;
      toTimeUs: number;
      limit?: number;
      after?: unknown;
      signal?: AbortSignal;
    }): Promise<RecordingEventsFactPage> {
      const identity = {
        recordingId: args.identity.recordingId,
        eventStreamId: args.identity.eventStreamId,
      };
      const descriptor = structuredClone(args.descriptor);
      const from = args.fromTimeUs;
      const to = args.toTimeUs;
      const limit = args.limit ?? RECORDING_EVENTS_FACT_PAGE_SIZE;
      const signal = args.signal;
      if (
        !isRecordingEventsIdentity(identity) ||
        !isRecordingEventsDescriptor(descriptor) ||
        !descriptor.finalized ||
        descriptor.eventStreamId !== identity.eventStreamId ||
        !isTrajectoryInteger(from) ||
        !isTrajectoryInteger(to) ||
        to < from ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > RECORDING_EVENTS_FACT_PAGE_SIZE
      )
        throw new RecordingEventsError('invalid');
      const after = continuation(args.after, identity, descriptor.streamSha256, from, to);
      signal?.throwIfAborted();
      const db = await dependencies.database();
      signal?.throwIfAborted();
      const tx = db.transaction(STORE, 'readonly');
      void tx.done.catch(() => undefined);
      const raw: unknown = await tx.store.get([
        identity.recordingId,
        identity.eventStreamId,
        'head',
        0,
      ]);
      if (
        !isRecordingEventsHead(raw) ||
        raw.recordingId !== identity.recordingId ||
        raw.eventStreamId !== identity.eventStreamId
      )
        throw new RecordingEventsError('missing');
      if (raw.retired) throw new RecordingEventsError('retired');
      if (after && after.writerGeneration !== raw.writerGeneration)
        throw new RecordingEventsError('stale-writer');
      if (
        !raw.finalized ||
        raw.state !== descriptor.state ||
        !(['totalBlocks', 'totalRecords', 'totalBytes', 'streamSha256'] as const).every(
          (key) => raw[key] === descriptor[key]
        )
      )
        throw new RecordingEventsError('integrity');
      const facts: StoredRecordingEventFact[] = [];
      let scanned = 0;
      const index = tx.store.index('timeBuckets');
      if (after) {
        const previous = admitStoredRecordingEventFact(
          await tx.store.get([identity.recordingId, identity.eventStreamId, 'fact', after.entryId]),
          identity
        );
        if (
          !previous.timeBuckets.some(
            (bucket) => bucket[2] === after.level && bucket[3] === after.index
          )
        )
          throw new RecordingEventsError('invalid');
      }
      for (const query of recordingEventIntervalQuery(from, to)) {
        if (after && query.level < after.level) continue;
        const resume = after?.level === query.level ? after : undefined;
        const range = IDBKeyRange.bound(
          [identity.recordingId, identity.eventStreamId, query.level, resume?.index ?? query.from],
          [identity.recordingId, identity.eventStreamId, query.level, query.to]
        );
        let cursor = await index.openCursor(range);
        if (cursor && resume) {
          const resumeKey = [
            identity.recordingId,
            identity.eventStreamId,
            query.level,
            resume.index,
          ];
          const resumePrimary = [
            identity.recordingId,
            identity.eventStreamId,
            'fact',
            resume.entryId,
          ];
          if (
            compareIndexedDbKeys(cursor.key, resumeKey) === 0 &&
            compareIndexedDbKeys(cursor.primaryKey, resumePrimary) < 0
          )
            cursor = await cursor.continuePrimaryKey(resumeKey, resumePrimary);
          if (
            cursor &&
            compareIndexedDbKeys(cursor.key, resumeKey) === 0 &&
            compareIndexedDbKeys(cursor.primaryKey, resumePrimary) === 0
          )
            cursor = await cursor.continue();
        }
        while (cursor) {
          signal?.throwIfAborted();
          const fact = admitStoredRecordingEventFact(cursor.value, identity);
          const bucket = cursor.key;
          if (
            !Array.isArray(bucket) ||
            bucket.length !== 4 ||
            bucket[0] !== identity.recordingId ||
            bucket[1] !== identity.eventStreamId ||
            bucket[2] !== query.level ||
            !isTrajectoryInteger(bucket[3]) ||
            bucket[3] < query.from ||
            bucket[3] > query.to
          )
            throw new RecordingEventsError('integrity');
          const first = firstRecordingEventIntervalMatch(
            recordingEventIntervalBuckets(fact.fromTimeUs, fact.toTimeUs),
            from,
            to
          );
          scanned++;
          if (first && first[0] === query.level && first[1] === bucket[3]) facts.push(fact);
          if (facts.length === limit || scanned === MAX_SCANNED_ROWS) {
            const next: RecordingEventsFactCursor = {
              ...identity,
              writerGeneration: raw.writerGeneration,
              streamSha256: descriptor.streamSha256,
              fromTimeUs: from,
              toTimeUs: to,
              level: query.level,
              index: bucket[3],
              entryId: fact.entryId,
            };
            await tx.done;
            signal?.throwIfAborted();
            return { writerGeneration: raw.writerGeneration, facts, next };
          }
          cursor = await cursor.continue();
        }
      }
      await tx.done;
      signal?.throwIfAborted();
      return { writerGeneration: raw.writerGeneration, facts, next: null };
    },
  };
}

/** Opens original immutable blocks and fences source deletion or recreation through close. */
export async function openRecordingEventsStream(
  store: Pick<ReturnType<typeof createRecordingEventsStore>, 'getHead' | 'readBlock'>,
  identity: RecordingEventsIdentity,
  rawDescriptor: unknown,
  expectedGeneration?: string
) {
  if (
    !isRecordingEventsIdentity(identity) ||
    !isRecordingEventsDescriptor(rawDescriptor) ||
    !rawDescriptor.finalized ||
    identity.eventStreamId !== rawDescriptor.eventStreamId
  )
    throw new RecordingEventsError('invalid');
  identity = { ...identity };
  const descriptor = structuredClone(rawDescriptor);
  const matches = (head: RecordingEventsHead | null): head is RecordingEventsHead =>
    head !== null &&
    !head.retired &&
    head.finalized &&
    (['state', 'totalBlocks', 'totalRecords', 'totalBytes', 'streamSha256'] as const).every(
      (key) => head[key] === descriptor[key]
    );
  const head = await store.getHead(identity);
  if (
    !matches(head) ||
    (expectedGeneration !== undefined && head.writerGeneration !== expectedGeneration)
  )
    throw new RecordingEventsError('conflict');
  const source = { sourceRecordingId: head.sourceRecordingId, descriptor };
  const generation = head.writerGeneration;
  return {
    source,
    writerGeneration: generation,
    ...createRecordingEventsStreamSource({
      identity: source,
      async readBlock(sequence) {
        const row = await store.readBlock(identity, sequence, generation);
        if (!row) throw new RecordingEventsError('missing');
        return row.bytes;
      },
      async beforeClose() {
        const current = await store.getHead(identity);
        if (
          !matches(current) ||
          current.writerGeneration !== generation ||
          current.sourceRecordingId !== source.sourceRecordingId
        )
          throw new RecordingEventsError('stale-writer');
      },
    }),
  };
}
