import { sha256 } from '@noble/hashes/sha2.js';
import { MemoryFileHandle, createHarness } from '../../assets/opfs-store.test-support';
import { releaseMediaSource } from '../../media-library/delete-cascade.sources';
import type { PhysicalDeleteAssetOperation } from '../../assets/contracts';
import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { installPersistenceLockManagerForTests } from '../../infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  STORE_NAME,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  RECORDING_EVENTS_STORE,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_CURSOR_BLOCKS_STORE,
} from '../../infrastructure/indexed-db/core.stores';
import fixture from '../../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import type { CursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/types';
import { createRecordingCursorTrajectoryStore } from '../cursor-trajectory/store';
import { createRecordingEventsStore } from '../recording-events/store';
import { retireRecordingEventSourcesInTransaction } from '../recording-events/retirement';
import { createNativeRecordingHistoryStore } from './store';
import { retireNativeRecordingHistoryInTransaction } from './retirement';
import type { NativeRecordingHistoryOffer } from './contracts';

const videoBytes = new Uint8Array(1000).fill(7);
const videoSha = Array.from(sha256(videoBytes), (byte) => byte.toString(16).padStart(2, '0')).join(
  ''
);
let db: IDBPDatabase;
let name: string;
let generation: number;
beforeEach(async () => {
  generation = 0;
  vi.spyOn(Date, 'now').mockReturnValue(100);
  const getFile = MemoryFileHandle.prototype.getFile;
  vi.spyOn(MemoryFileHandle.prototype, 'getFile').mockImplementation(async function (
    this: MemoryFileHandle
  ) {
    const file = await getFile.call(this);
    return new File([file], 'memory-file', { lastModified: Date.now() });
  });
  const harness = createHarness();
  vi.stubGlobal('navigator', { storage: { getDirectory: harness.options.getOriginRoot } });
  const assets = await harness.root.getDirectoryHandle('sniptale-assets', { create: true });
  const objects = await assets.getDirectoryHandle('objects', { create: true });
  const file = await objects.getFileHandle('video-asset', { create: true });
  const writable = await file.createWritable();
  await writable.write(videoBytes);
  await writable.close();
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
  name = `native-history-${crypto.randomUUID()}`;
  db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  await seed();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  db.close();
  await deleteDB(name);
  installPersistenceLockManagerForTests(null);
});
const cursor: CursorTrajectoryDescriptor = {
  format: 'cursor-trajectory-v1',
  formatVersion: 1,
  algorithm: 'sed-window-v1',
  encoding: 'json-ascii-int-v1',
  trajectoryId: 'a'.repeat(32),
  state: 'complete',
  finalized: true,
  totalBlocks: 1,
  totalRecords: 3,
  totalSamples: 1,
  totalBytes: 1000,
  streamSha256: 'b'.repeat(64),
};
function offer(): NativeRecordingHistoryOffer {
  if (!isRecordingEventsDescriptor(fixture.descriptor)) throw new Error('Invalid fixture.');
  return {
    recordingId: 'recording',
    controllerLeaseId: 'lease',
    videoSha256: videoSha,
    width: 640,
    height: 360,
    cursorTrajectory: cursor,
    recordingEvents: fixture.descriptor,
  };
}
function store() {
  return createNativeRecordingHistoryStore({
    database: async () => db,
    mintGeneration: () => `generation-${++generation}`,
    now: () => 100,
  });
}
async function seed(assetId = 'video-asset') {
  await db.put(STORE_NAME, {
    id: 'recording',
    assetId,
    filename: 'source.mp4',
    mimeType: 'video/mp4',
    size: 1000,
    createdAt: 1,
  });
  await db.put(ASSET_REFS_STORE, {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: 'video/mp4',
    sha256: videoSha,
    size: 1000,
  });
  await db.put(ASSET_OWNERS_STORE, {
    assetId,
    ownerKind: 'recording',
    ownerId: 'recording',
    role: 'body',
  });
  if (!(await db.get(NATIVE_TRANSFER_SESSIONS_STORE, 'recording')))
    await db.put(NATIVE_TRANSFER_SESSIONS_STORE, {
      id: 'recording',
      kind: 'recording-complete',
      controllerLeaseId: 'lease',
      sha256: videoSha,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 10000,
      metadata: { width: 640, height: 360, openEditor: true },
    });
}
it('serializes parallel offers into one intent and preserves planned writer identities on retry', async () => {
  const owner = store();
  const [first, second] = await Promise.all([owner.plan(offer()), owner.plan(offer())]);
  expect(second).toEqual(first);
  expect(first.cursor?.writer).not.toBeNull();
  expect(first.events?.writer).not.toBeNull();
  expect(generation).toBe(3);
  expect(await owner.read('recording')).toEqual(first);
  expect(
    await db.get(RECORDING_CURSOR_TRAJECTORIES_STORE, [
      first.cursor!.writer!.recordingId,
      cursor.trajectoryId,
    ])
  ).toBeUndefined();
  expect((await db.get(NATIVE_TRANSFER_SESSIONS_STORE, 'recording')).expiresAt).toBe(
    Number.MAX_SAFE_INTEGER
  );
});
it('refuses a missing or changed video binding without publishing an intent or a private head', async () => {
  const owner = store();
  await expect(owner.plan({ ...offer(), videoSha256: 'e'.repeat(64) })).rejects.toMatchObject({
    code: 'conflict',
  });
  await db.delete(STORE_NAME, 'recording');
  await expect(owner.plan(offer())).rejects.toMatchObject({ code: 'missing' });
  expect(await owner.read('recording')).toBeNull();
  await seed();
  const intent = await owner.plan(offer());
  await seed('replacement-video-asset');
  await expect(owner.plan(offer())).rejects.toMatchObject({ code: 'stale-root' });
  expect(await owner.read('recording')).toEqual(intent);
});
it.each(['cursor', 'events'] as const)(
  'fences a delayed %s begin after atomic source deletion and recreation',
  async (kind) => {
    const owner = store();
    const intent = await owner.plan(offer());
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const opening = (async () => {
      entered.resolve();
      await resume.promise;
      if (kind === 'cursor') {
        const writer = intent.cursor!.writer!;
        return createRecordingCursorTrajectoryStore({
          database: async () => db,
          mintGeneration: () => writer.writerGeneration,
        }).begin(writer, { width: 640, height: 360 }, intent.recordingId, intent.operationId);
      }
      const writer = intent.events!.writer!;
      return createRecordingEventsStore({
        database: async () => db,
        mintGeneration: () => writer.writerGeneration,
      }).begin(writer, intent.recordingId, intent.operationId);
    })();
    const refused = expect(opening).rejects.toMatchObject({ code: 'retired' });
    await entered.promise;
    const tx = db.transaction(
      [
        STORE_NAME,
        NATIVE_TRANSFER_SESSIONS_STORE,
        RECORDING_CURSOR_TRAJECTORIES_STORE,
        RECORDING_CURSOR_BLOCKS_STORE,
        RECORDING_EVENTS_STORE,
      ],
      'readwrite'
    );
    await retireNativeRecordingHistoryInTransaction(tx, 'recording', 200);
    await retireRecordingEventSourcesInTransaction(tx, 'recording');
    await tx.objectStore(STORE_NAME).delete('recording');
    await tx.done;
    await seed('replacement-video-asset');
    resume.resolve();
    await refused;
    expect((await owner.read('recording'))?.phase).toBe('cancelled');
    await expect(owner.plan(offer())).rejects.toMatchObject({ code: 'retired' });
    expect((await db.get(STORE_NAME, 'recording')).assetId).toBe('replacement-video-asset');
  }
);
it('retires a started private writer with its source and preserves an explicitly restored generation', async () => {
  const owner = store();
  const intent = await owner.plan(offer());
  const writer = intent.events!.writer!;
  let nextGeneration = writer.writerGeneration;
  const events = createRecordingEventsStore({
    database: async () => db,
    mintGeneration: () => nextGeneration,
  });
  await events.begin(writer, intent.recordingId, intent.operationId);
  await events.retire(writer, writer.writerGeneration);
  nextGeneration = 'restored-generation';
  const restored = await events.restore(writer, intent.recordingId, intent.operationId);
  const tx = db.transaction(
    [
      NATIVE_TRANSFER_SESSIONS_STORE,
      RECORDING_CURSOR_TRAJECTORIES_STORE,
      RECORDING_CURSOR_BLOCKS_STORE,
      RECORDING_EVENTS_STORE,
    ],
    'readwrite'
  );
  await retireNativeRecordingHistoryInTransaction(tx, 'recording', 200);
  await tx.done;
  expect(await events.getHead(restored)).toMatchObject({
    retired: false,
    writerGeneration: 'restored-generation',
  });
  expect((await owner.read('recording'))?.phase).toBe('cancelled');
});
it('adds a later independent stream without replacing the first writer', async () => {
  const owner = store();
  const { recordingEvents: _events, ...cursorOnly } = offer();
  const first = await owner.plan(cursorOnly);
  const combined = await owner.plan(offer());
  expect(combined.cursor).toEqual(first.cursor);
  expect(combined.operationId).toBe(first.operationId);
  expect(combined.events?.writer).not.toBeNull();
  expect(combined.revision).toBe(first.revision + 1);
});

it('cancels the intent in the actual source cascade transaction that removes the video body', async () => {
  const owner = store();
  const intent = await owner.plan(offer());
  const writer = intent.events!.writer!;
  const events = createRecordingEventsStore({
    database: async () => db,
    mintGeneration: () => writer.writerGeneration,
  });
  await events.begin(writer, intent.recordingId, intent.operationId);
  const physicalDelete: PhysicalDeleteAssetOperation = {
    operationId: 'delete',
    kind: 'physical-delete',
    status: 'pending',
    createdAt: 200,
    updatedAt: 200,
    assetIds: [],
  };
  const tx = db.transaction([...db.objectStoreNames], 'readwrite');
  await releaseMediaSource(
    tx,
    { id: 'recording:recording', source: { kind: 'recording', recordingId: 'recording' } },
    physicalDelete
  );
  await tx.done;
  expect(await db.get(STORE_NAME, 'recording')).toBeUndefined();
  expect((await owner.read('recording'))?.phase).toBe('cancelled');
  expect(await events.getHead(writer)).toBeNull();
  expect(
    await db.get(RECORDING_EVENTS_STORE, [writer.recordingId, writer.eventStreamId, 'head', 0])
  ).toMatchObject({ retired: true });
  expect(physicalDelete.assetIds).toContain('video-asset');
});

it('refuses a forged private writer identity before source cleanup can retire another recording', async () => {
  const owner = store();
  const intent = await owner.plan(offer());
  const parent = await db.get(NATIVE_TRANSFER_SESSIONS_STORE, 'recording');
  parent.metadata.history = {
    ...intent,
    cursor: {
      ...intent.cursor,
      writer: { ...intent.cursor!.writer, recordingId: 'another-recording' },
    },
  };
  await db.put(NATIVE_TRANSFER_SESSIONS_STORE, parent);
  const tx = db.transaction(
    [
      NATIVE_TRANSFER_SESSIONS_STORE,
      RECORDING_CURSOR_TRAJECTORIES_STORE,
      RECORDING_CURSOR_BLOCKS_STORE,
      RECORDING_EVENTS_STORE,
    ],
    'readwrite'
  );
  await expect(
    retireNativeRecordingHistoryInTransaction(tx, 'recording', 200)
  ).rejects.toMatchObject({ code: 'invalid' });
  tx.abort();
  await tx.done.catch(() => undefined);
  expect(await db.get(STORE_NAME, 'recording')).toBeDefined();
  expect(
    await db.get(RECORDING_CURSOR_TRAJECTORIES_STORE, ['another-recording', cursor.trajectoryId])
  ).toBeUndefined();
});

it('persists one bounded chunk outbox, rejects stale progress and clears bytes on source cancellation', async () => {
  const owner = store();
  const input = offer();
  input.recordingEvents = { ...input.recordingEvents!, totalBytes: 70000 };
  const intent = await owner.plan(input);
  const descriptor = intent.events!.descriptor;
  const entries = [{ ...fixture.manifest[0]!, byteLength: 40000 }];
  const pull = {
    kind: 'chunks' as const,
    requestId: 'chunk-one',
    entries,
    chunkIndex: 1 as const,
    firstChunk: new Uint8Array(32768).fill(17),
  };
  const advanced = await owner.savePull(intent, { kind: 'events', descriptor, pull });
  expect((await owner.read('recording'))?.events?.pull).toEqual(pull);
  await expect(owner.savePull(intent, { kind: 'events', descriptor, pull })).rejects.toMatchObject({
    code: 'conflict',
  });
  for (const patch of [
    { firstChunk: new Uint8Array(32769) },
    { firstChunk: null },
    { entries: Array.from({ length: 33 }, () => entries[0]!) },
    { requestId: 'invalid request' },
  ])
    await expect(
      owner.savePull(advanced, { kind: 'events', descriptor, pull: { ...pull, ...patch } })
    ).rejects.toMatchObject({ code: 'invalid' });
  await expect(
    owner.savePull(advanced, { kind: 'events', descriptor, pull: { kind: 'published' } })
  ).rejects.toMatchObject({ code: 'invalid' });
  const tx = db.transaction(
    [
      NATIVE_TRANSFER_SESSIONS_STORE,
      RECORDING_CURSOR_TRAJECTORIES_STORE,
      RECORDING_CURSOR_BLOCKS_STORE,
      RECORDING_EVENTS_STORE,
    ],
    'readwrite'
  );
  await retireNativeRecordingHistoryInTransaction(tx, 'recording', 200);
  await tx.done;
  const cancelled = await owner.read('recording');
  expect(cancelled?.events?.pull).toBeNull();
  expect(cancelled?.cursor?.pull).toBeNull();
  await expect(
    owner.savePull(advanced, { kind: 'events', descriptor, pull })
  ).rejects.toMatchObject({ code: 'conflict' });
});

it('rechecks the pinned video and finalized descriptor before it commits transport progress', async () => {
  const owner = store();
  const intent = await owner.plan(offer());
  const descriptor = intent.events!.descriptor;
  const pull = {
    kind: 'manifest' as const,
    requestId: 'manifest',
    nextSequence: 0,
    prefixSha256: fixture.emptyStreamSha256,
  };
  await expect(
    owner.savePull(intent, {
      kind: 'events',
      descriptor: { ...descriptor, streamSha256: 'f'.repeat(64) },
      pull,
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  await seed('replacement-video-asset');
  await expect(owner.admit(intent)).rejects.toMatchObject({ code: 'stale-root' });
  await expect(owner.savePull(intent, { kind: 'events', descriptor, pull })).rejects.toMatchObject({
    code: 'stale-root',
  });
  expect(await owner.read('recording')).toEqual(intent);
});

it('rebinds the same durable video to the new lease without replacing writers or the pending request', async () => {
  const owner = store();
  const intent = await owner.plan(offer());
  const advanced = await owner.savePull(intent, {
    kind: 'events',
    descriptor: intent.events!.descriptor,
    pull: {
      kind: 'manifest',
      requestId: 'request-A',
      nextSequence: 0,
      prefixSha256: fixture.emptyStreamSha256,
    },
  });
  const rebound = await owner.rebind({
    recordingId: intent.recordingId,
    controllerLeaseId: 'lease-B',
    videoSha256: intent.videoSha256,
    totalBytes: 1000,
  });
  expect(rebound.controllerLeaseId).toBe('lease-B');
  expect(rebound.revision).toBe(advanced.revision + 1);
  expect(rebound.cursor).toEqual(advanced.cursor);
  expect(rebound.events).toEqual(advanced.events);
  expect(rebound.operationId).toBe(advanced.operationId);
  expect(rebound.recordingAssetId).toBe(advanced.recordingAssetId);
  expect(await db.get(NATIVE_TRANSFER_SESSIONS_STORE, intent.recordingId)).toMatchObject({
    controllerLeaseId: 'lease-B',
    metadata: { history: rebound },
  });
  await expect(owner.admit(advanced)).rejects.toMatchObject({ code: 'conflict' });
  await expect(
    owner.savePull(advanced, {
      kind: 'events',
      descriptor: advanced.events!.descriptor,
      pull: { kind: 'verified' },
    })
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(await owner.admit(rebound)).toEqual(rebound);
});
it('refuses rebind for a changed hash, byte count or replaced video without changing its parent', async () => {
  const owner = store();
  const intent = await owner.plan(offer());
  const parent = await db.get(NATIVE_TRANSFER_SESSIONS_STORE, intent.recordingId);
  for (const patch of [{ videoSha256: 'e'.repeat(64) }, { totalBytes: 999 }]) {
    await expect(
      owner.rebind({
        recordingId: intent.recordingId,
        controllerLeaseId: 'lease-B',
        videoSha256: intent.videoSha256,
        ...patch,
      })
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await db.get(NATIVE_TRANSFER_SESSIONS_STORE, intent.recordingId)).toEqual(parent);
  }
  await seed('replacement-video');
  await expect(
    owner.rebind({
      recordingId: intent.recordingId,
      controllerLeaseId: 'lease-B',
      videoSha256: intent.videoSha256,
    })
  ).rejects.toMatchObject({ code: 'stale-root' });
  expect(await db.get(NATIVE_TRANSFER_SESSIONS_STORE, intent.recordingId)).toEqual(parent);
});

it('preserves a bounded partial chunk byte-for-byte across lease rebind', async () => {
  const owner = store();
  const input = offer();
  input.recordingEvents = { ...input.recordingEvents!, totalBytes: 70000 };
  const intent = await owner.plan(input);
  const pull = {
    kind: 'chunks' as const,
    requestId: 'partial-A',
    entries: [{ ...fixture.manifest[0]!, byteLength: 40000 }],
    chunkIndex: 1 as const,
    firstChunk: new Uint8Array(32768).fill(23),
  };
  const advanced = await owner.savePull(intent, {
    kind: 'events',
    descriptor: intent.events!.descriptor,
    pull,
  });
  const rebound = await owner.rebind({
    recordingId: intent.recordingId,
    controllerLeaseId: 'lease-B',
    videoSha256: intent.videoSha256,
  });
  expect(rebound.events).toEqual(advanced.events);
  expect((await owner.read(intent.recordingId))?.events?.pull).toEqual(pull);
});
it('refuses rebind of a cancelled intent and leaves its tombstones intact', async () => {
  const owner = store();
  const intent = await owner.plan(offer());
  const tx = db.transaction(
    [
      NATIVE_TRANSFER_SESSIONS_STORE,
      RECORDING_CURSOR_TRAJECTORIES_STORE,
      RECORDING_CURSOR_BLOCKS_STORE,
      RECORDING_EVENTS_STORE,
    ],
    'readwrite'
  );
  await retireNativeRecordingHistoryInTransaction(tx, intent.recordingId, 200);
  await tx.done;
  const cancelled = await owner.read(intent.recordingId);
  await expect(
    owner.rebind({
      recordingId: intent.recordingId,
      controllerLeaseId: 'lease-B',
      videoSha256: intent.videoSha256,
    })
  ).rejects.toMatchObject({ code: 'retired' });
  expect(await owner.read(intent.recordingId)).toEqual(cancelled);
});

it('reads retry candidates one row at a time and observes a lease change before yielding the next parent', async () => {
  const owner = store();
  await owner.plan(offer());
  const parent = await db.get(NATIVE_TRANSFER_SESSIONS_STORE, 'recording');
  const later = {
    ...parent,
    id: 'z-offered',
    metadata: { width: 640, height: 360, openEditor: false, recordingEvents: fixture.descriptor },
  };
  await db.put(NATIVE_TRANSFER_SESSIONS_STORE, later);
  await db.put(NATIVE_TRANSFER_SESSIONS_STORE, {
    ...later,
    id: 'unrelated',
    metadata: { width: 640, height: 360, openEditor: false },
  });
  vi.spyOn(db, 'getAll').mockRejectedValue(new Error('unbounded-parent-read'));
  const candidates = owner.candidates('lease');
  expect(await candidates.next()).toEqual({ value: 'recording', done: false });
  await db.put(NATIVE_TRANSFER_SESSIONS_STORE, { ...later, controllerLeaseId: 'another-lease' });
  expect(await candidates.next()).toEqual({ value: undefined, done: true });
});

it('recovers video receipt from the owned body before an intent exists and after a lease change', async () => {
  const owner = store();
  expect(await owner.videoReceipt('recording')).toEqual({
    durable: true,
    sha256: videoSha,
    totalBytes: 1000,
  });
  await owner.plan({ ...offer(), controllerLeaseId: 'lease-B' }, 'lease');
  expect((await db.get(NATIVE_TRANSFER_SESSIONS_STORE, 'recording')).controllerLeaseId).toBe(
    'lease-B'
  );
  expect((await owner.read('recording'))?.controllerLeaseId).toBe('lease-B');
  expect(await owner.videoReceipt('recording')).toEqual({
    durable: true,
    sha256: videoSha,
    totalBytes: 1000,
  });
});
it('refuses receipt recovery without a matching body owner or after source retirement', async () => {
  const owner = store();
  await db.delete(ASSET_OWNERS_STORE, ['recording', 'recording', 'body']);
  await expect(owner.videoReceipt('recording')).rejects.toMatchObject({ code: 'stale-root' });
  await seed();
  await owner.plan(offer());
  await seed('replacement-video-asset');
  await expect(owner.videoReceipt('recording')).rejects.toMatchObject({ code: 'stale-root' });
});
it('does not adopt an offered parent after deletion or a competing lease change', async () => {
  const owner = store();
  await expect(
    owner.plan({ ...offer(), controllerLeaseId: 'lease-B' }, 'wrong-lease')
  ).rejects.toMatchObject({ code: 'conflict' });
  expect(await owner.read('recording')).toBeNull();
  await db.delete(STORE_NAME, 'recording');
  await expect(
    owner.plan({ ...offer(), controllerLeaseId: 'lease-B' }, 'lease')
  ).rejects.toMatchObject({ code: 'missing' });
  expect(await owner.read('recording')).toBeNull();
});
