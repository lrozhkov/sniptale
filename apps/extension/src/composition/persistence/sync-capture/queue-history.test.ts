import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  installPersistenceLockManagerForTests,
  runWithPersistenceMutationPermit,
  runWithPersistentDataErasureBarrier,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import { captureRootKey, type CapturedChange } from './contracts';
import {
  acknowledgeSyncQueueHistory,
  loadSyncQueueHistoryBatch,
  type SyncQueueHistoryBatch,
} from './queue-history';
import {
  commandSyncQueue,
  enqueueSyncQueueOperation,
  readSyncQueueSourceInTransaction,
} from './queue';
import { initDB } from '../infrastructure/indexed-db/core';
import {
  queueConnectionKey,
  queueHash,
  queueOperationKey,
  type SyncQueueScope,
} from './queue-model';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
const scope: SyncQueueScope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
const source = { kind: 'operation', operationId: 'op' } as const;
beforeEach(() => {
  vi.clearAllMocks();
  installPersistenceLockManagerForTests(null);
});
afterEach(() => installPersistenceLockManagerForTests(null));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  let fail = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => fail && name === 'sync_outbox');
  const table = (name: string) => fixture.rows.get(name)!;
  io.database.mockResolvedValue(fixture.database);
  const profile = {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  };
  table('sync_capture').set('profile', profile);
  const capture: CapturedChange = createNativeCapture({
    version: 1,
    kind: 'sync-operation',
    key: '["change","op"]',
    createdAt: 1,
    spaceId: 'space',
    connectionGeneration: 3,
    rootKind: 'media',
    rootId: 'root',
    rootKey: captureRootKey('space', 'media', 'root'),
    generation: 1,
    operationId: 'op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'tombstone' },
  });
  table('sync_capture').set(capture.key, structuredClone(capture));
  return { ...fixture, table, capture, profile, failWrites: (value: boolean) => (fail = value) };
}
function acknowledge(batch: SyncQueueHistoryBatch) {
  return runWithPersistenceMutationPermit((permit) => acknowledgeSyncQueueHistory(batch, permit));
}
function cursorKey(batch: SyncQueueHistoryBatch) {
  return JSON.stringify(['queue-history-delivery-v1', batch.sourceRef]);
}
it('reads virtual and retained history without writes and acknowledges only a disjoint cursor', async () => {
  const f = setup();
  const initial = structuredClone(f.rows);
  expect(await loadSyncQueueHistoryBatch(scope, { kind: 'connection' })).toMatchObject({
    deliveredSequence: 0,
    throughSequence: 0,
    transitions: [],
    skipped: 0,
  });
  expect(f.rows).toEqual(initial);
  await enqueueSyncQueueOperation(f.capture);
  const before = structuredClone(f.rows);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  expect(batch).toMatchObject({
    sourceRef: queueHash(queueOperationKey(scope, 'op')),
    deliveredSequence: 0,
    throughSequence: 1,
    skipped: 0,
    transitions: [{ sequence: 1, code: 'enqueued' }],
  });
  expect(f.rows).toEqual(before);
  await acknowledge(batch);
  expect(f.table('sync_capture')).toEqual(before.get('sync_capture'));
  const outbox = new Map(f.table('sync_outbox'));
  expect(outbox.delete(cursorKey(batch))).toBe(true);
  expect(outbox).toEqual(before.get('sync_outbox'));
  expect(await loadSyncQueueHistoryBatch(scope, source)).toMatchObject({
    deliveredSequence: 1,
    throughSequence: 1,
    transitions: [],
    skipped: 0,
  });
  expect(await loadSyncQueueHistoryBatch(scope, { kind: 'connection' })).toMatchObject({
    deliveredSequence: 0,
    throughSequence: 1,
  });
});
it('reuses active admission for history read and acknowledgement instead of entering the database again', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  await runWithPersistenceMutationPermit(async (permit) => {
    io.database.mockClear();
    await loadSyncQueueHistoryBatch(scope, source, permit);
    await acknowledgeSyncQueueHistory(batch, permit);
    expect(io.database).toHaveBeenCalledTimes(2);
    expect(io.database.mock.calls.every((call) => call[0] === permit)).toBe(true);
  });
});
it('keeps parallel and repeated acknowledgements monotonic without losing newer transitions', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const old = await loadSyncQueueHistoryBatch(scope, { kind: 'connection' });
  await commandSyncQueue(scope, 1, 'pause');
  const newer = await loadSyncQueueHistoryBatch(scope, { kind: 'connection' });
  await runWithPersistenceMutationPermit(async (permit) => {
    const gate = deferred<typeof f.database>();
    io.database.mockReturnValueOnce(gate.promise);
    const delayed = acknowledgeSyncQueueHistory(old, permit);
    await acknowledgeSyncQueueHistory(newer, permit);
    gate.resolve(f.database);
    await delayed;
    await acknowledgeSyncQueueHistory(newer, permit);
  });
  expect(await loadSyncQueueHistoryBatch(scope, { kind: 'connection' })).toMatchObject({
    deliveredSequence: 2,
    throughSequence: 2,
    transitions: [],
  });
  await commandSyncQueue(scope, 2, 'resume');
  expect(await loadSyncQueueHistoryBatch(scope, { kind: 'connection' })).toMatchObject({
    deliveredSequence: 2,
    throughSequence: 3,
    transitions: [{ sequence: 3, code: 'resumed' }],
  });
});
it('reports only undelivered overflow and retains native bounded markers after acknowledgement', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  await acknowledge(await loadSyncQueueHistoryBatch(scope, { kind: 'connection' }));
  for (let revision = 1; revision <= 70; revision++) {
    await commandSyncQueue(scope, revision, revision % 2 ? 'pause' : 'resume');
  }
  const batch = await loadSyncQueueHistoryBatch(scope, { kind: 'connection' });
  expect(batch).toMatchObject({ deliveredSequence: 1, throughSequence: 71, skipped: 6 });
  expect(batch.transitions).toHaveLength(64);
  expect(batch.transitions[0]?.sequence).toBe(8);
  const native = structuredClone(f.table('sync_outbox').get(queueConnectionKey(scope)));
  await acknowledge(batch);
  expect(f.table('sync_outbox').get(queueConnectionKey(scope))).toEqual(native);
  expect(await loadSyncQueueHistoryBatch(scope, { kind: 'connection' })).toMatchObject({
    deliveredSequence: 71,
    skipped: 0,
    transitions: [],
  });
});
it('preserves evidence on write failure and retries the same selection safely', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(acknowledge(batch)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  expect(await loadSyncQueueHistoryBatch(scope, source)).toEqual(batch);
  f.failWrites(false);
  await acknowledge(batch);
  expect((await loadSyncQueueHistoryBatch(scope, source)).deliveredSequence).toBe(1);
});
it('refuses delayed acknowledgement after erasure and after enrollment recreation', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  await runWithPersistentDataErasureBarrier(async () => {
    f.table('sync_capture').clear();
    f.table('sync_outbox').clear();
  });
  await expect(acknowledge(batch)).rejects.toThrow('profile changed');
  expect(f.table('sync_outbox').size).toBe(0);
  f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
  const recreatedCapture = createNativeCapture({ ...f.capture, profileCreatedAt: 2 });
  f.table('sync_capture').set(recreatedCapture.key, recreatedCapture);
  await enqueueSyncQueueOperation(recreatedCapture);
  const before = structuredClone(f.rows);
  await expect(acknowledge(batch)).rejects.toThrow('profile changed');
  expect(f.rows).toEqual(before);
  const recreated = await loadSyncQueueHistoryBatch({ ...scope, profileCreatedAt: 2 }, source);
  expect(recreated.sourceRef).not.toBe(batch.sourceRef);
  expect(recreated.deliveredSequence).toBe(0);
});
it('refuses a missing source or changed retained capture without changing evidence', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  f.table('sync_capture').set(f.capture.key, { ...f.capture, generation: 2 });
  const before = structuredClone(f.rows);
  await expect(loadSyncQueueHistoryBatch(scope, source)).rejects.toThrow('capture changed');
  await expect(acknowledge(batch)).rejects.toThrow('capture changed');
  expect(f.rows).toEqual(before);
  f.table('sync_outbox').delete(queueOperationKey(scope, 'op'));
  const missing = structuredClone(f.rows);
  await expect(acknowledge(batch)).rejects.toThrow('Invalid sync queue operation');
  expect(f.rows).toEqual(missing);
});
it('detaches scope, source and acknowledgement batch before database admission', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const selectedScope = { ...scope };
  const selectedSource: { kind: 'operation'; operationId: string } = { ...source };
  const readGate = deferred<typeof f.database>();
  io.database.mockReturnValueOnce(readGate.promise);
  const read = loadSyncQueueHistoryBatch(selectedScope, selectedSource);
  selectedScope.profileCreatedAt = 2;
  selectedSource.operationId = 'changed';
  readGate.resolve(f.database);
  const batch = await read;
  await runWithPersistenceMutationPermit(async (permit) => {
    const writeGate = deferred<typeof f.database>();
    io.database.mockReturnValueOnce(writeGate.promise);
    const write = acknowledgeSyncQueueHistory(batch, permit);
    batch.scope.profileCreatedAt = 9;
    batch.throughSequence = 100;
    batch.transitions.length = 0;
    writeGate.resolve(f.database);
    await write;
  });
  expect((await loadSyncQueueHistoryBatch(scope, source)).deliveredSequence).toBe(1);
});
it('requires an active permit before and after database admission without acquiring a nested lock', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  let expired!: PersistenceMutationPermit;
  await runWithPersistenceMutationPermit((permit) => {
    expired = permit;
  });
  io.database.mockClear();
  await expect(acknowledgeSyncQueueHistory(batch, expired)).rejects.toThrow('permit required');
  expect(io.database).not.toHaveBeenCalled();
  const gate = deferred<typeof f.database>();
  let pending!: Promise<void>;
  await runWithPersistenceMutationPermit((permit) => {
    io.database.mockReturnValueOnce(gate.promise);
    pending = acknowledgeSyncQueueHistory(batch, permit);
  });
  const before = structuredClone(f.rows);
  const result = expect(pending).rejects.toThrow('permit required');
  gate.resolve(f.database);
  await result;
  expect(f.rows).toEqual(before);
  await acknowledge(batch);
});
it('drains admitted acknowledgement before erasure and cannot recreate rows afterwards', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  const entered = deferred<void>();
  const gate = deferred<typeof f.database>();
  io.database.mockReturnValueOnce(gate.promise);
  const delivery = runWithPersistenceMutationPermit(async (permit) => {
    entered.resolve();
    await acknowledgeSyncQueueHistory(batch, permit);
  });
  await entered.promise;
  let erased = false;
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    expect(f.table('sync_outbox').get(cursorKey(batch))).toMatchObject({ deliveredSequence: 1 });
    f.table('sync_capture').clear();
    f.table('sync_outbox').clear();
    erased = true;
  });
  expect(erased).toBe(false);
  gate.resolve(f.database);
  await delivery;
  await erasure;
  await expect(acknowledge(batch)).rejects.toThrow('profile changed');
  expect(f.table('sync_outbox').size).toBe(0);
});
it.each([-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1, '1'])(
  'refuses invalid delivery ordinal %s before storage',
  async (throughSequence) => {
    setup();
    const batch = await loadSyncQueueHistoryBatch(scope, { kind: 'connection' });
    io.database.mockClear();
    const invalid = Object.assign({}, batch, { throughSequence });
    await runWithPersistenceMutationPermit(async (permit) => {
      await expect(acknowledgeSyncQueueHistory(invalid, permit)).rejects.toThrow('history batch');
    });
    expect(io.database).not.toHaveBeenCalled();
  }
);
it('refuses forged source digests, invalid transition metadata and impossible progress', async () => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  const before = structuredClone(f.rows);
  await expect(acknowledge({ ...batch, sourceRef: '0'.repeat(64) })).rejects.toThrow(
    'history batch'
  );
  await expect(acknowledge({ ...batch, transitions: [] })).rejects.toThrow('history batch');
  await expect(
    acknowledge({
      ...batch,
      skipped: 1,
      throughSequence: 2,
      transitions: batch.transitions.map((item) => ({ ...item, sequence: 2 })),
    })
  ).rejects.toThrow('source changed');
  await expect(acknowledge({ ...batch, skipped: 1, transitions: [] })).rejects.toThrow(
    'source changed'
  );
  await expect(
    acknowledge({
      ...batch,
      transitions: batch.transitions.map((item) => ({ ...item, code: 'paused' as const })),
    })
  ).rejects.toThrow('source changed');
  expect(f.rows).toEqual(before);
});
it.each([
  { deliveredSequence: -1 },
  { deliveredSequence: 2 },
  { sourceRef: '0'.repeat(64) },
  { version: 2 },
  { kind: 'queue-connection' },
])('refuses corrupt delivery metadata without repair: %s', async (override) => {
  const f = setup();
  await enqueueSyncQueueOperation(f.capture);
  const batch = await loadSyncQueueHistoryBatch(scope, source);
  f.table('sync_outbox').set(cursorKey(batch), {
    version: 1,
    kind: 'queue-history-delivery',
    key: cursorKey(batch),
    sourceRef: batch.sourceRef,
    deliveredSequence: 0,
    ...override,
  });
  const before = structuredClone(f.rows);
  await expect(loadSyncQueueHistoryBatch(scope, source)).rejects.toThrow('history cursor');
  await expect(acknowledge(batch)).rejects.toThrow('history cursor');
  expect(f.rows).toEqual(before);
});

it('refuses an invalid direct source identity before reading or writing a transaction', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  const db = await initDB();
  const tx = db.transaction(['sync_capture', 'sync_outbox'], 'readonly');
  await expect(readSyncQueueSourceInTransaction(tx, scope, '')).rejects.toThrow('identity');
  await tx.done;
  expect(f.rows).toEqual(before);
});
