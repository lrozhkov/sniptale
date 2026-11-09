import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createCursorTrajectoryBlockPacker } from '../../../../features/video/project/cursor-trajectory/blocks';
import { installPersistenceLockManagerForTests } from '../../infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  RECORDING_CURSOR_TRAJECTORIES_STORE as HEADS,
  RECORDING_CURSOR_BLOCKS_STORE as BLOCKS,
} from '../../infrastructure/indexed-db/core.stores';
import { createRecordingCursorTrajectoryStore } from './store';
import { createRecordingCursorTrajectoryReader } from './reader';
import { retireRecordingCursorTrajectoriesInTransaction } from './retirement';
import { publishStagedCursorTrajectoryInTransaction } from './publication';
import {
  cursorTrajectoryStagingIdentity,
  retireJournalCursorTrajectoryStagesInTransaction,
} from './staging';
import type { CursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/types';

const identity = {
  recordingId: 'recording-store-test',
  trajectoryId: '0123456789abcdef0123456789abcdef',
};
const geometry = { width: 1280, height: 800 };
const databases: { name: string; db: IDBPDatabase }[] = [];
let databaseSequence = 0;

beforeEach(() => {
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  installPersistenceLockManagerForTests(null);
  for (const { name, db } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});

async function setup() {
  const name = `cursor-store-${++databaseSequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ name, db });
  let generation = 0;
  const store = createRecordingCursorTrajectoryStore({
    database: async () => db,
    mintGeneration: () => `generation-${++generation}`,
  });
  return { db, store, writer: await store.begin(identity, geometry) };
}

function packedBlocks(count = 1, xQ8 = 256) {
  const packer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const blocks = [];
  for (let index = 0; index < count; index += 1) {
    blocks.push(
      ...packer.append({
        kind: 'segment',
        segmentId: index,
        activeTimeUs: index * 100,
        ...geometry,
        clock: {
          source: 'dom-event-time',
          timestampQuantumUs: null,
          resolutionBoundUs: null,
          mappingUncertaintyUs: null,
        },
        reason: index === 0 ? 'start' : 'resume',
      })
    );
    blocks.push(
      ...packer.append({
        kind: 'sample',
        segmentId: index,
        observationSeq: index,
        activeTimeUs: index * 100,
        xQ8,
        yQ8: 0,
        observed: true,
        visible: true,
        event: 'move',
        button: 'none',
        relatedObservationSeq: null,
        anchors: [],
      })
    );
    blocks.push(
      ...packer.append({
        kind: 'boundary',
        segmentId: index,
        activeTimeUs: index * 100 + 50,
        reason: index === count - 1 ? 'stop' : 'pause',
      })
    );
  }
  blocks.push(...packer.finish());
  return { blocks, totals: packer.summary() };
}

async function stagedFixture(store: ReturnType<typeof createRecordingCursorTrajectoryStore>) {
  const staging = { ...identity, recordingId: 'private-cursor-staging' };
  await store.retire(staging);
  const writer = await store.restore(staging, geometry, identity.recordingId);
  const { blocks, totals } = packedBlocks(4, 512);
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, totals, 'complete');
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: identity.trajectoryId,
    state: 'complete',
    finalized: true,
    ...totals,
  };
  return { writer, blocks, descriptor };
}

it.each([false, true])(
  'publishes staged original bytes atomically with local recording remap=%s',
  async (remap) => {
    const { db, store, writer: previous } = await setup();
    const stage = await stagedFixture(store);
    const recordingId = remap ? 'restored-local-recording' : identity.recordingId;
    const target = { ...identity, recordingId };
    const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
    if (!remap) await retireRecordingCursorTrajectoriesInTransaction(tx, recordingId);
    const published = await publishStagedCursorTrajectoryInTransaction({
      tx,
      stagingWriter: stage.writer,
      recordingId,
      descriptor: stage.descriptor,
      mintGeneration: () => crypto.randomUUID(),
    });
    await tx.done;
    expect(published.writerGeneration).not.toBe(stage.writer.writerGeneration);
    expect(published.writerGeneration).not.toBe(previous.writerGeneration);
    expect((await store.getHead(target))?.sourceRecordingId).toBe(identity.recordingId);
    expect((await store.getHead(target))?.streamSha256).toBe(stage.descriptor.streamSha256);
    for (const block of stage.blocks)
      expect((await store.readBlock(target, block.entry.sequence))?.bytes).toEqual(block.bytes);
    expect(await store.getHead(stage.writer)).toBeNull();
    await expect(store.append(stage.writer, stage.blocks[0]!)).rejects.toMatchObject({
      code: 'retired',
    });
    if (!remap)
      await expect(store.append(previous, stage.blocks[0]!)).rejects.toMatchObject({
        code: 'stale-writer',
      });
    const replay = db.transaction([HEADS, BLOCKS], 'readwrite');
    void replay.done.catch(() => undefined);
    await expect(
      publishStagedCursorTrajectoryInTransaction({
        tx: replay,
        stagingWriter: stage.writer,
        recordingId,
        descriptor: stage.descriptor,
        mintGeneration: () => crypto.randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'retired' });
    replay.abort();
    await replay.done.catch(() => undefined);
    expect((await store.getHead(target))?.writerGeneration).toBe(published.writerGeneration);
  }
);

it('preserves previous parent and both histories when staged publication aborts, then retries', async () => {
  const { db, store, writer } = await setup();
  const old = packedBlocks().blocks[0]!;
  await store.append(writer, old);
  const before = await store.getHead(identity);
  await db.put('recordings', { id: identity.recordingId, fixture: 'old-parent' });
  const stage = await stagedFixture(store);
  const tx = db.transaction([HEADS, BLOCKS, 'recordings'], 'readwrite');
  void tx.done.catch(() => undefined);
  await retireRecordingCursorTrajectoriesInTransaction(tx, identity.recordingId);
  await publishStagedCursorTrajectoryInTransaction({
    tx,
    stagingWriter: stage.writer,
    recordingId: identity.recordingId,
    descriptor: stage.descriptor,
    mintGeneration: () => crypto.randomUUID(),
  });
  await tx.objectStore('recordings').delete(identity.recordingId);
  tx.abort();
  await expect(tx.done).rejects.toBeDefined();
  expect(await store.getHead(identity)).toEqual(before);
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(old.bytes);
  expect((await store.getHead(stage.writer))?.retired).toBe(false);
  expect(await db.get('recordings', identity.recordingId)).toEqual({
    id: identity.recordingId,
    fixture: 'old-parent',
  });
  const retry = db.transaction([HEADS, BLOCKS], 'readwrite');
  await retireRecordingCursorTrajectoriesInTransaction(retry, identity.recordingId);
  await publishStagedCursorTrajectoryInTransaction({
    tx: retry,
    stagingWriter: stage.writer,
    recordingId: identity.recordingId,
    descriptor: stage.descriptor,
    mintGeneration: () => crypto.randomUUID(),
  });
  await retry.done;
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(stage.blocks[0]?.bytes);
});

it('refuses live-target replacement and corrupted staged bytes without changing either source', async () => {
  const { db, store } = await setup();
  const stage = await stagedFixture(store);
  const live = db.transaction([HEADS, BLOCKS], 'readwrite');
  void live.done.catch(() => undefined);
  await expect(
    publishStagedCursorTrajectoryInTransaction({
      tx: live,
      stagingWriter: stage.writer,
      recordingId: identity.recordingId,
      descriptor: stage.descriptor,
      mintGeneration: () => crypto.randomUUID(),
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  live.abort();
  await live.done.catch(() => undefined);
  const last = stage.blocks.at(-1)!;
  const row = await store.readBlock(stage.writer, last.entry.sequence);
  if (!row) throw new Error('Missing staged bytes.');
  const corrupt = row.bytes.slice();
  corrupt[20] = (corrupt[20] ?? 0) ^ 1;
  await db.put(BLOCKS, { ...row, bytes: corrupt });
  const target = 'refused-restored-recording';
  const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
  void tx.done.catch(() => undefined);
  await expect(
    publishStagedCursorTrajectoryInTransaction({
      tx,
      stagingWriter: stage.writer,
      recordingId: target,
      descriptor: stage.descriptor,
      mintGeneration: () => crypto.randomUUID(),
    })
  ).rejects.toMatchObject({ code: 'integrity' });
  tx.abort();
  await tx.done.catch(() => undefined);
  expect(await store.getHead({ ...identity, recordingId: target })).toBeNull();
  expect((await store.getHead(stage.writer))?.retired).toBe(false);
  expect((await store.getHead(identity))?.retired).toBe(false);
});

it('refuses a complete receipt when an authenticated prefix contains an explicit gap', async () => {
  const { store, writer } = await setup();
  const packer = createCursorTrajectoryBlockPacker(identity.recordingId, identity.trajectoryId);
  const blocks = packer.append({
    kind: 'segment',
    segmentId: 0,
    activeTimeUs: 0,
    ...geometry,
    clock: {
      source: 'dom-event-time',
      timestampQuantumUs: null,
      resolutionBoundUs: null,
      mappingUncertaintyUs: null,
    },
    reason: 'start',
  });
  blocks.push(
    ...packer.append({
      kind: 'gap',
      segmentId: 0,
      fromTimeUs: 0,
      toTimeUs: 50,
      firstLostObservationSeq: null,
      lastLostObservationSeq: null,
      reason: 'source-unavailable',
    }),
    ...packer.finish()
  );
  for (const block of blocks) await store.append(writer, block);
  await expect(store.finalize(writer, packer.summary(), 'complete')).rejects.toMatchObject({
    code: 'integrity',
  });
  expect((await store.getHead(identity))?.finalized).toBe(false);
  expect((await store.finalize(writer, packer.summary(), 'incomplete')).state).toBe('incomplete');
});

it('rolls history retirement back with the parent transaction and permits an idempotent retry', async () => {
  const { db, store, writer } = await setup();
  const block = packedBlocks().blocks[0];
  if (!block) throw new Error('Missing block.');
  await store.append(writer, block);
  await db.put('recordings', { id: identity.recordingId, fixture: 'parent' });
  const before = await store.getHead(identity);
  const failed = db.transaction([HEADS, BLOCKS, 'recordings'], 'readwrite');
  void failed.done.catch(() => undefined);
  await retireRecordingCursorTrajectoriesInTransaction(
    failed,
    identity.recordingId,
    identity.trajectoryId
  );
  await failed.objectStore('recordings').delete(identity.recordingId);
  failed.abort();
  await expect(failed.done).rejects.toBeDefined();
  expect(await store.getHead(identity)).toEqual(before);
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(block.bytes);
  expect(await db.get('recordings', identity.recordingId)).toEqual({
    id: identity.recordingId,
    fixture: 'parent',
  });
  const accepted = db.transaction([HEADS, BLOCKS, 'recordings'], 'readwrite');
  await retireRecordingCursorTrajectoriesInTransaction(
    accepted,
    identity.recordingId,
    identity.trajectoryId
  );
  await accepted.objectStore('recordings').delete(identity.recordingId);
  await accepted.done;
  const tombstone: unknown = await db.get(HEADS, [identity.recordingId, identity.trajectoryId]);
  expect(await store.getHead(identity)).toBeNull();
  expect(await db.count(BLOCKS)).toBe(0);
  expect(await db.get('recordings', identity.recordingId)).toBeUndefined();
  const duplicate = db.transaction([HEADS, BLOCKS], 'readwrite');
  await retireRecordingCursorTrajectoriesInTransaction(
    duplicate,
    identity.recordingId,
    identity.trajectoryId
  );
  await duplicate.done;
  expect(await db.get(HEADS, [identity.recordingId, identity.trajectoryId])).toEqual(tombstone);
});

it('fences a known source descriptor before begin while preserving another recording', async () => {
  const { db, store } = await setup();
  const fresh = { ...identity, trajectoryId: 'f'.repeat(32) };
  const other = { ...identity, recordingId: 'other-recording' };
  const otherWriter = await store.begin(other, geometry);
  const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
  await retireRecordingCursorTrajectoriesInTransaction(
    tx,
    identity.recordingId,
    fresh.trajectoryId
  );
  await tx.done;
  await expect(store.begin(fresh, geometry)).rejects.toMatchObject({ code: 'retired' });
  expect((await store.getHead(other))?.writerGeneration).toBe(otherWriter.writerGeneration);
  const replacement = await store.restore(fresh, geometry);
  expect(replacement.writerGeneration).not.toBe(otherWriter.writerGeneration);
  expect((await store.getHead(fresh))?.retired).toBe(false);
});

it('refuses an append waiting for database admission after source retirement and same-identity restore', async () => {
  const { db, store, writer } = await setup();
  const admitted = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<IDBPDatabase>();
  const delayed = createRecordingCursorTrajectoryStore({
    database: async () => {
      admitted.resolve();
      return gate.promise;
    },
    mintGeneration: () => 'delayed-generation',
  });
  const block = packedBlocks().blocks[0];
  if (!block) throw new Error('Missing block.');
  const pending = delayed.append(writer, block);
  const refused = expect(pending).rejects.toMatchObject({ code: 'stale-writer' });
  await admitted.promise;
  const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
  await retireRecordingCursorTrajectoriesInTransaction(tx, identity.recordingId);
  await tx.done;
  const replacement = await store.restore(identity, geometry);
  gate.resolve(db);
  await refused;
  expect((await store.getHead(identity))?.totalBlocks).toBe(0);
  await store.append(replacement, block);
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(block.bytes);
});

it('serializes parallel appends and refuses conflicting duplicates', async () => {
  const { store, writer } = await setup();
  const { blocks } = packedBlocks(2);
  await Promise.all([store.append(writer, blocks[0]!), store.append(writer, blocks[1]!)]);
  await Promise.all([store.append(writer, blocks[0]!), store.append(writer, blocks[0]!)]);
  expect((await store.getHead(identity))?.totalBlocks).toBe(2);
  await expect(store.append(writer, packedBlocks(2, 512).blocks[0]!)).rejects.toMatchObject({
    code: 'conflict',
  });
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(blocks[0]!.bytes);
});

it('refuses delayed append after deletion and restore', async () => {
  const { store, writer } = await setup();
  const { blocks } = packedBlocks();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  }).then(() => store.append(writer, blocks[0]!));
  await store.retire(identity);
  const replacement = await store.restore(identity, geometry);
  const rejection = expect(pending).rejects.toMatchObject({ code: 'stale-writer' });
  release();
  await rejection;
  expect((await store.getHead(identity))?.totalBlocks).toBe(0);
  await store.append(replacement, blocks[0]!);
  expect((await store.getHead(identity))?.totalBlocks).toBe(1);
});

it('restore creates a new generation for the same trajectory', async () => {
  const { store, writer } = await setup();
  const { blocks } = packedBlocks();
  await store.append(writer, blocks[0]!);
  await store.retire(identity);
  await expect(store.begin(identity, geometry)).rejects.toMatchObject({ code: 'retired' });
  expect(await store.getHead(identity)).toBeNull();
  expect(await store.readBlock(identity, 0)).toBeNull();
  const replacement = await store.restore(identity, geometry);
  expect(replacement.trajectoryId).toBe(writer.trajectoryId);
  expect(replacement.writerGeneration).not.toBe(writer.writerGeneration);
  await store.append(replacement, blocks[0]!);
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(blocks[0]!.bytes);
});

it('remaps the local recording identity without changing canonical source bytes', async () => {
  const { store } = await setup();
  const local = { ...identity, recordingId: 'restored-local-copy' };
  const writer = await store.begin(local, geometry, identity.recordingId);
  const { blocks, totals } = packedBlocks();
  await store.append(writer, blocks[0]!);
  await store.finalize(writer, totals, 'complete');
  expect((await store.readBlock(local, 0))?.bytes).toEqual(blocks[0]!.bytes);
  expect((await store.getHead(local))?.sourceRecordingId).toBe(identity.recordingId);
});

it('replays identical append and finalize without replacement', async () => {
  const { store, writer } = await setup();
  const { blocks, totals } = packedBlocks();
  await store.append(writer, blocks[0]!);
  const [finalized, duplicate] = await Promise.all([
    store.finalize(writer, totals, 'complete'),
    store.finalize(writer, totals, 'complete'),
  ]);
  expect(duplicate).toEqual(finalized);
  await store.append(writer, blocks[0]!);
  expect(await store.finalize(writer, totals, 'complete')).toEqual(finalized);
  await expect(store.finalize(writer, totals, 'incomplete')).rejects.toMatchObject({
    code: 'conflict',
  });
  await expect(store.append(writer, packedBlocks(2).blocks[1]!)).rejects.toMatchObject({
    code: 'finalized',
  });
});

it('bounds manifest pages and keeps reads write-free and detached', async () => {
  const { store, writer } = await setup();
  const { blocks, totals } = packedBlocks(35);
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, totals, 'complete');
  const writes = vi.spyOn(IDBObjectStore.prototype, 'put');
  expect(await store.manifestPage(identity, 0)).toHaveLength(32);
  expect((await store.manifestPage(identity, 32)).map((entry) => entry.sequence)).toEqual([
    32, 33, 34,
  ]);
  const first = await store.readBlock(identity, 0);
  first!.bytes[0] = 0;
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(blocks[0]!.bytes);
  expect(writes).not.toHaveBeenCalled();
});

it('keeps a tombstone when retirement precedes the first writer', async () => {
  const { db } = await setup();
  const fresh = { ...identity, recordingId: 'recording-not-started' };
  const store = createRecordingCursorTrajectoryStore({
    database: async () => db,
    mintGeneration: () => crypto.randomUUID(),
  });
  await store.retire(fresh);
  await expect(store.begin(fresh, geometry)).rejects.toMatchObject({ code: 'retired' });
  expect(await store.getHead(fresh)).toBeNull();
  expect(await db.count(BLOCKS)).toBe(0);
});

it('does not publish a block when the head write aborts, and permits command retry', async () => {
  const { db, store, writer } = await setup();
  const { blocks } = packedBlocks();
  const original = IDBObjectStore.prototype.put;
  const abort = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey
  ) {
    if (this.name === HEADS && isPlainRecord(value) && value['totalBlocks'] === 1) {
      this.transaction.abort();
      throw new DOMException('Synthetic head write failure', 'QuotaExceededError');
    }
    return key === undefined ? original.call(this, value) : original.call(this, value, key);
  });
  await expect(store.append(writer, blocks[0]!)).rejects.toThrow();
  abort.mockRestore();
  expect((await store.getHead(identity))?.totalBlocks).toBe(0);
  expect(await db.count(BLOCKS)).toBe(0);
  await store.append(writer, blocks[0]!);
  expect((await store.getHead(identity))?.totalBlocks).toBe(1);
});

it('refuses a bad stream prefix at finalization and preserves the committed bytes', async () => {
  const { store, writer } = await setup();
  const { blocks, totals } = packedBlocks();
  const bad = { ...blocks[0]!, entry: { ...blocks[0]!.entry, prefixSha256: 'a'.repeat(64) } };
  await store.append(writer, bad);
  await expect(store.finalize(writer, totals, 'complete')).rejects.toMatchObject({
    code: 'integrity',
  });
  expect((await store.getHead(identity))?.finalized).toBe(false);
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(blocks[0]!.bytes);
});

it('rejects malformed identities and out-of-order append without discarding valid data', async () => {
  const { store, writer } = await setup();
  const { blocks } = packedBlocks(2);
  await expect(store.append(writer, blocks[1]!)).rejects.toMatchObject({ code: 'conflict' });
  expect(() => store.begin({ ...identity, recordingId: '../private' }, geometry)).toThrow();
  await store.append(writer, blocks[0]!);
  await expect(
    store.append({ ...writer, writerGeneration: 'wrong' }, blocks[1]!)
  ).rejects.toMatchObject({ code: 'stale-writer' });
  expect((await store.getHead(identity))?.totalBlocks).toBe(1);
});

it('reads a bounded time-index window with both neighboring blocks and no writes', async () => {
  const { store, writer } = await setup();
  const { blocks, totals } = packedBlocks(40);
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, totals, 'complete');
  const put = vi.spyOn(IDBObjectStore.prototype, 'put');
  const window = await store.readWindow(identity, 1350);
  expect(window?.blocks.map((block) => block.sequence)).toEqual([12, 13, 14]);
  expect(window).toMatchObject({ fromTimeUs: 1300, toTimeUs: 1400, head: { finalized: true } });
  expect(
    window!.blocks.reduce((sum, block) => sum + block.bytes.byteLength, 0)
  ).toBeLessThanOrEqual(3 * 65536);
  expect((await store.readWindow(identity, 0))?.blocks.map((block) => block.sequence)).toEqual([
    0, 1,
  ]);
  expect((await store.readWindow(identity, 99999))?.blocks.map((block) => block.sequence)).toEqual([
    38, 39,
  ]);
  expect((await store.readWindow(identity, 99999))?.toTimeUs).toBeNull();
  window!.blocks[1]!.bytes[0] = 0;
  expect((await store.readWindow(identity, 1350))!.blocks[1]!.bytes).toEqual(blocks[13]!.bytes);
  expect(put).not.toHaveBeenCalled();
});

it('returns no window after retirement and rejects corrupted bytes instead of repairing them', async () => {
  const { store, writer, db } = await setup();
  expect((await store.readWindow(identity, 0))?.blocks).toEqual([]);
  await expect(store.readWindow(identity, -1)).rejects.toMatchObject({ code: 'invalid' });
  const { blocks } = packedBlocks();
  await store.append(writer, blocks[0]!);
  const stored = await store.readBlock(identity, 0);
  expect(stored).not.toBeNull();
  stored!.bytes[0] = 0;
  await db.put(BLOCKS, stored!);
  const put = vi.spyOn(IDBObjectStore.prototype, 'put');
  await expect(store.readWindow(identity, 0)).rejects.toMatchObject({ code: 'integrity' });
  expect(put).not.toHaveBeenCalled();
  await store.retire(identity);
  expect(await store.readWindow(identity, 0)).toBeNull();
});

it('caches bounded trajectory windows and invalidates them after retirement and restore', async () => {
  const { store, writer } = await setup();
  const { blocks, totals } = packedBlocks(40);
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, totals, 'complete');
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: identity.trajectoryId,
    finalized: true,
    state: 'complete',
    ...totals,
  };
  const read = vi.spyOn(store, 'readWindow');
  const reader = createRecordingCursorTrajectoryReader(store);
  const first = await reader.read(identity, descriptor, 125);
  expect(first).not.toBeNull();
  expect(reader.position(first!, 125)?.x).toBe(1 / 1280);
  expect(await reader.read(identity, descriptor, 130)).toBe(first);
  expect(read).toHaveBeenCalledTimes(1);
  for (let index = 2; index < 20; index++)
    await reader.read(identity, descriptor, index * 100 + 25);
  expect(reader.cachedWindowCount).toBe(4);
  await expect(
    reader.read(identity, { ...descriptor, totalSamples: 39 }, 125)
  ).rejects.toMatchObject({ code: 'integrity' });
  await store.retire(identity);
  expect(await reader.read(identity, descriptor, 125)).toBeNull();
  expect(reader.cachedWindowCount).toBe(0);
  const restored = await store.restore(identity, geometry);
  for (const block of blocks) await store.append(restored, block);
  await store.finalize(restored, totals, 'complete');
  const after = await reader.read(identity, descriptor, 125);
  expect(after).not.toBe(first);
  expect(reader.position(after!, 125)?.x).toBe(1 / 1280);
  expect(Object.isFrozen(after?.records)).toBe(true);
  expect(Object.isFrozen(after?.records[0])).toBe(true);
  reader.clear();
  expect(reader.cachedWindowCount).toBe(0);
});

it('fences an old block reader after deletion and recreation with identical bytes', async () => {
  const { store, writer } = await setup();
  const { blocks, totals } = packedBlocks(2);
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, totals, 'complete');
  expect((await store.readBlock(identity, 0, writer.writerGeneration))?.sequence).toBe(0);
  await store.retire(identity);
  await expect(store.readBlock(identity, 1, writer.writerGeneration)).rejects.toMatchObject({
    code: 'retired',
  });
  const replacement = await store.restore(identity, geometry);
  for (const block of blocks) await store.append(replacement, block);
  await store.finalize(replacement, totals, 'complete');
  await expect(store.readBlock(identity, 1, writer.writerGeneration)).rejects.toMatchObject({
    code: 'stale-writer',
  });
  expect((await store.readBlock(identity, 1, replacement.writerGeneration))?.sequence).toBe(1);
});

it('refuses delayed old-writer cleanup after restoration of the same identity', async () => {
  const { store, writer } = await setup();
  await store.retire(identity);
  const replacement = await store.restore(identity, geometry);
  const { blocks } = packedBlocks();
  await store.append(replacement, blocks[0]!);
  await expect(store.retire(identity, writer.writerGeneration)).rejects.toMatchObject({
    code: 'stale-writer',
  });
  expect((await store.getHead(identity))?.writerGeneration).toBe(replacement.writerGeneration);
  expect((await store.readBlock(identity, 0))?.entry.blockSha256).toBe(
    blocks[0]!.entry.blockSha256
  );
  await store.retire(identity, replacement.writerGeneration);
  await store.retire(identity, replacement.writerGeneration);
  expect(await store.getHead(identity)).toBeNull();
});

it('retires only journal-owned private stages and preserves public sources in the same namespace', async () => {
  const { db, store } = await setup();
  const privateIdentity = cursorTrajectoryStagingIdentity('journal-one', identity);
  const otherIdentity = cursorTrajectoryStagingIdentity('journal-two', identity);
  const publicIdentity = { ...privateIdentity, trajectoryId: 'b'.repeat(32) };
  const privateWriter = await store.begin(
    privateIdentity,
    geometry,
    identity.recordingId,
    'journal-one'
  );
  const otherWriter = await store.begin(
    otherIdentity,
    geometry,
    identity.recordingId,
    'journal-two'
  );
  const publicWriter = await store.begin(publicIdentity, geometry, identity.recordingId);
  const { blocks } = packedBlocks();
  await store.append(privateWriter, blocks[0]!);
  await store.append(otherWriter, blocks[0]!);
  await expect(
    store.begin(privateIdentity, geometry, identity.recordingId, 'journal-two')
  ).rejects.toMatchObject({ code: 'conflict' });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
    await retireJournalCursorTrajectoryStagesInTransaction(tx, 'journal-one');
    await tx.done;
  }
  expect(await store.getHead(privateIdentity)).toBeNull();
  expect((await store.getHead(otherIdentity))?.writerGeneration).toBe(otherWriter.writerGeneration);
  expect((await store.getHead(publicIdentity))?.writerGeneration).toBe(
    publicWriter.writerGeneration
  );
  expect((await store.readBlock(otherIdentity, 0))?.entry.blockSha256).toBe(
    blocks[0]!.entry.blockSha256
  );
});

it('removes private journal ownership from a published source and keeps it safe from recovery cleanup', async () => {
  const { db, store } = await setup();
  const staged = cursorTrajectoryStagingIdentity('journal-one', identity);
  const writer = await store.begin(staged, geometry, identity.recordingId, 'journal-one');
  const { blocks, totals } = packedBlocks();
  for (const block of blocks) await store.append(writer, block);
  await store.finalize(writer, totals, 'complete');
  const descriptor: CursorTrajectoryDescriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: identity.trajectoryId,
    state: 'complete',
    finalized: true,
    ...totals,
  };
  const tx = db.transaction([HEADS, BLOCKS], 'readwrite');
  await publishStagedCursorTrajectoryInTransaction({
    tx,
    stagingWriter: writer,
    recordingId: 'published',
    descriptor,
    mintGeneration: () => crypto.randomUUID(),
  });
  await tx.done;
  const cleanup = db.transaction([HEADS, BLOCKS], 'readwrite');
  await retireJournalCursorTrajectoryStagesInTransaction(cleanup, 'journal-one');
  await cleanup.done;
  const target = { ...identity, recordingId: 'published' };
  expect((await store.getHead(target))?.stagingJournalId).toBeUndefined();
  expect((await store.readBlock(target, 0))?.entry.blockSha256).toBe(blocks[0]!.entry.blockSha256);
});

it('refuses a delayed begin instead of adopting a different restored generation', async () => {
  const { db, store } = await setup();
  let entered!: () => void, release!: () => void;
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const lateStore = createRecordingCursorTrajectoryStore({
    database: async () => {
      entered();
      await gate;
      return db;
    },
    mintGeneration: () => crypto.randomUUID(),
  });
  const pending = lateStore.begin(identity, geometry);
  const refused = expect(pending).rejects.toThrow();
  await requested;
  await store.retire(identity);
  const restored = await store.restore(identity, geometry);
  const before = await store.getHead(identity);
  release();
  await refused;
  expect(await store.getHead(identity)).toEqual(before);
  expect(before?.writerGeneration).toBe(restored.writerGeneration);
});
