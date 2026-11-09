import { createCursorTrajectoryStreamSource } from '../../../../features/video/project/cursor-trajectory/stream';
import { decodeCursorTrajectoryBlock } from '../../../../features/video/project/cursor-trajectory/blocks';
import { evaluateCursorTrajectory } from '../../../../features/video/project/cursor-trajectory/evaluate';
import {
  isCursorTrajectoryDescriptor,
  isTrajectoryInteger,
} from '../../../../features/video/project/cursor-trajectory/records';
import type {
  CursorTrajectoryRecord,
  CursorTrajectorySegment,
} from '../../../../features/video/project/cursor-trajectory/types';
import {
  RecordingCursorTrajectoryError,
  type RecordingCursorTrajectoryIdentity,
  type RecordingCursorTrajectoryHead,
} from './contracts';
import { isCursorTrajectoryIdentity } from './guards';
import type { createRecordingCursorTrajectoryStore } from './store';

interface RecordingCursorTrajectoryWindow {
  readonly fromTimeUs: number;
  readonly toTimeUs: number | null;
  readonly records: readonly CursorTrajectoryRecord[];
  readonly initialSegment: CursorTrajectorySegment | null;
}

function freezeRecord<T extends CursorTrajectoryRecord>(record: T): T {
  if (record.kind === 'segment') Object.freeze(record.clock);
  if (record.kind === 'sample') Object.freeze(record.anchors);
  return Object.freeze(record);
}

/** Disposable reader cache. Durable heads and generations remain the only history authority. */
export function createRecordingCursorTrajectoryReader(
  store: Pick<ReturnType<typeof createRecordingCursorTrajectoryStore>, 'getHead' | 'readWindow'>
) {
  const cache = new Map<string, RecordingCursorTrajectoryWindow>();
  const identities = new Map<string, string>();
  return {
    async read(
      identity: RecordingCursorTrajectoryIdentity,
      descriptor: unknown,
      activeTimeUs: number
    ): Promise<RecordingCursorTrajectoryWindow | null> {
      if (
        !isCursorTrajectoryIdentity(identity) ||
        !isCursorTrajectoryDescriptor(descriptor) ||
        !isTrajectoryInteger(activeTimeUs) ||
        descriptor.trajectoryId !== identity.trajectoryId
      )
        throw new RecordingCursorTrajectoryError('invalid');
      identity = { ...identity };
      const expected = structuredClone(descriptor);
      const head = await store.getHead(identity);
      const identityKey = JSON.stringify([identity.recordingId, identity.trajectoryId]);
      const oldGeneration = identities.get(identityKey);
      const generation = head
        ? JSON.stringify([identity.recordingId, identity.trajectoryId, head.writerGeneration])
        : null;
      if (oldGeneration && oldGeneration !== generation) {
        for (const key of cache.keys()) if (key.startsWith(`${oldGeneration}:`)) cache.delete(key);
        identities.delete(identityKey);
      }
      if (!head || !generation) return null;
      if (
        !head.finalized ||
        !expected.finalized ||
        head.state !== expected.state ||
        !(
          ['totalBlocks', 'totalRecords', 'totalSamples', 'totalBytes', 'streamSha256'] as const
        ).every((key) => head[key] === expected[key])
      )
        throw new RecordingCursorTrajectoryError('integrity');
      identities.set(identityKey, generation);
      for (const [key, value] of cache) {
        if (
          key.startsWith(`${generation}:`) &&
          activeTimeUs >= value.fromTimeUs &&
          (value.toTimeUs === null || activeTimeUs < value.toTimeUs)
        ) {
          cache.delete(key);
          cache.set(key, value);
          return value;
        }
      }
      const loaded = await store.readWindow(identity, activeTimeUs);
      if (!loaded) return null;
      if (
        loaded.head.writerGeneration !== head.writerGeneration ||
        loaded.head.streamSha256 !== expected.streamSha256 ||
        loaded.head.totalBlocks !== expected.totalBlocks
      )
        throw new RecordingCursorTrajectoryError('conflict');
      const records: CursorTrajectoryRecord[] = [];
      for (const row of loaded.blocks) {
        const block = decodeCursorTrajectoryBlock(row.bytes, row.initialSegment);
        if (
          !block ||
          block.recordingId !== loaded.head.sourceRecordingId ||
          block.trajectoryId !== identity.trajectoryId
        )
          throw new RecordingCursorTrajectoryError('integrity');
        records.push(...block.records.map(freezeRecord));
      }
      const initial = loaded.blocks[0]?.initialSegment ?? null;
      const value = Object.freeze({
        fromTimeUs: loaded.fromTimeUs,
        toTimeUs: loaded.toTimeUs,
        records: Object.freeze(records),
        initialSegment: initial ? freezeRecord(initial) : null,
      });
      cache.set(`${generation}:${value.fromTimeUs}`, value);
      while (cache.size > 4) {
        const first = cache.keys().next().value;
        if (first !== undefined) cache.delete(first);
      }
      // Identity lookup is advisory and has the same bound as the data cache.
      for (const [key, entry] of identities)
        if (![...cache.keys()].some((item) => item.startsWith(`${entry}:`))) identities.delete(key);
      return value;
    },
    position(window: RecordingCursorTrajectoryWindow, activeTimeUs: number) {
      return evaluateCursorTrajectory(window.records, activeTimeUs, window.initialSegment);
    },
    clear() {
      cache.clear();
      identities.clear();
    },
    get cachedWindowCount() {
      return cache.size;
    },
  };
}

/** Binds bounded transfer reads to the finalized source generation, including the final receipt boundary. */
export async function openRecordingCursorTrajectoryStream(
  store: Pick<ReturnType<typeof createRecordingCursorTrajectoryStore>, 'getHead' | 'readBlock'>,
  identity: RecordingCursorTrajectoryIdentity,
  rawDescriptor: unknown,
  expectedGeneration?: string
) {
  if (
    !isCursorTrajectoryIdentity(identity) ||
    !isCursorTrajectoryDescriptor(rawDescriptor) ||
    !rawDescriptor.finalized ||
    identity.trajectoryId !== rawDescriptor.trajectoryId
  )
    throw new RecordingCursorTrajectoryError('invalid');
  identity = { ...identity };
  const descriptor = structuredClone(rawDescriptor);
  const matches = (
    head: RecordingCursorTrajectoryHead | null
  ): head is RecordingCursorTrajectoryHead =>
    head !== null &&
    !head.retired &&
    head.finalized &&
    (
      [
        'state',
        'totalBlocks',
        'totalRecords',
        'totalSamples',
        'totalBytes',
        'streamSha256',
      ] as const
    ).every((key) => head[key] === descriptor[key]);
  const head = await store.getHead(identity);
  if (
    !matches(head) ||
    (expectedGeneration !== undefined && head.writerGeneration !== expectedGeneration)
  )
    throw new RecordingCursorTrajectoryError('conflict');
  const source = {
    sourceRecordingId: head.sourceRecordingId,
    width: head.width,
    height: head.height,
    descriptor,
  };
  const generation = head.writerGeneration;
  return {
    source,
    writerGeneration: generation,
    ...createCursorTrajectoryStreamSource({
      identity: source,
      async readBlock(sequence) {
        const row = await store.readBlock(identity, sequence, generation);
        if (!row) throw new RecordingCursorTrajectoryError('missing');
        return row.bytes;
      },
      async beforeClose() {
        const current = await store.getHead(identity);
        if (
          !matches(current) ||
          current.writerGeneration !== generation ||
          current.sourceRecordingId !== source.sourceRecordingId ||
          current.width !== source.width ||
          current.height !== source.height
        )
          throw new RecordingCursorTrajectoryError('stale-writer');
      },
    }),
  };
}
