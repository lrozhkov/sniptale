import { createNativeCapture } from './test-support/frozen-snapshot-database';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import {
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
} from '../infrastructure/mutation-barrier';
import { enqueueSyncQueueOperation } from './queue';
import { captureRootKey, type CapturedChange } from './contracts';
import {
  queueHash,
  queueConnectionKey,
  queueOperationKey,
  queueOperationPrefix,
  type SyncQueueScope,
} from './queue-model';
import {
  loadSyncQueueHistoryEnrollment,
  loadSyncQueueHistoryScanPage,
  loadSyncQueueHistoryScanState,
  saveSyncQueueHistoryScanState,
} from './queue-history-scan';

const io = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
}));
const scope: SyncQueueScope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
type Range = { lower: string; upper: string; lowerOpen: boolean };
beforeEach(() => {
  vi.clearAllMocks();
  installPersistenceLockManagerForTests(null);
  vi.stubGlobal('IDBKeyRange', {
    bound: (lower: string, upper: string, lowerOpen = false): Range => ({
      lower,
      upper,
      lowerOpen,
    }),
  });
});
afterEach(() => {
  installPersistenceLockManagerForTests(null);
  vi.unstubAllGlobals();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup(count = 0) {
  let fail = false;
  const fixture = createReviewWorkspaceStoreFixture((name) => fail && name === 'sync_outbox');
  const table = (name: string) => fixture.rows.get(name)!;
  const getAll = vi.fn(async (range: Range, limit: number, snapshot: Map<string, unknown>) =>
    structuredClone(
      [...snapshot]
        .filter(
          ([key]) =>
            (range.lowerOpen ? key > range.lower : key >= range.lower) && key <= range.upper
        )
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .slice(0, limit)
        .map(([, row]) => row)
    )
  );
  const captureReads = vi.fn();
  const database = {
    transaction(stores: string[], mode: string) {
      const snapshot = structuredClone(table('sync_outbox'));
      const tx = fixture.database.transaction(stores, mode);
      return {
        abort: tx.abort,
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return {
            ...store,
            get: async (key: IDBValidKey) => {
              if (name === 'sync_capture') captureReads(key);
              return store.get(key);
            },
            getAll: (range: Range, limit: number) => {
              if (name !== 'sync_outbox') throw new Error('Unexpected scan store');
              return getAll(range, limit, snapshot);
            },
          };
        },
        get done() {
          return tx.done;
        },
      };
    },
  };
  io.database.mockResolvedValue(database);
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
  const ids = Array.from({ length: count }, (_, i) => `operation-${String(i).padStart(4, '0')}`);
  for (const operationId of ids) {
    const capture: CapturedChange = createNativeCapture({
      version: 1,
      kind: 'sync-operation',
      key: JSON.stringify(['change', operationId]),
      createdAt: 1,
      spaceId: 'space',
      connectionGeneration: 3,
      rootKind: 'media',
      rootId: 'root',
      rootKey: captureRootKey('space', 'media', 'root'),
      generation: 1,
      operationId,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'tombstone' },
    });
    table('sync_capture').set(capture.key, capture);
    await enqueueSyncQueueOperation(capture);
  }
  getAll.mockClear();
  captureReads.mockClear();
  return {
    ...fixture,
    table,
    database,
    profile,
    ids,
    getAll,
    captureReads,
    failWrites: (value: boolean) => (fail = value),
  };
}
function receipt(scopeValue: SyncQueueScope, operationId: string, deliveredSequence = 1) {
  const sourceRef = queueHash(queueOperationKey(scopeValue, operationId));
  const key = JSON.stringify(['queue-history-delivery-v1', sourceRef]);
  return { version: 1, kind: 'queue-history-delivery', key, sourceRef, deliveredSequence };
}
it('keeps enrollment, virtual state and page reads write-free, including disabled enrollment', async () => {
  const f = await setup();
  f.table('sync_capture').delete('profile');
  const absent = structuredClone(f.rows);
  expect(await loadSyncQueueHistoryEnrollment()).toBeNull();
  expect(f.rows).toEqual(absent);
  f.table('sync_capture').set('profile', { ...f.profile, enabled: false });
  const before = structuredClone(f.rows);
  expect(await loadSyncQueueHistoryEnrollment()).toEqual(scope);
  const state = await loadSyncQueueHistoryScanState(scope);
  expect(state).toEqual({ scope, revision: 0, afterKey: null });
  expect(await loadSyncQueueHistoryScanPage(state)).toEqual({
    sources: [],
    nextAfterKey: null,
    more: false,
    invalidSources: 0,
  });
  expect(await saveSyncQueueHistoryScanState(state, null)).toEqual(state);
  expect(f.rows).toEqual(before);
  f.table('sync_capture').set('profile', { ...f.profile, enabled: 'invalid' });
  await expect(loadSyncQueueHistoryEnrollment()).rejects.toThrow('enrollment');
});
it('traverses more than 128 native sources, persists restart progress and wraps at the end', async () => {
  const f = await setup(137);
  const capture = structuredClone(f.table('sync_capture'));
  const seen: string[] = [];
  let state = await loadSyncQueueHistoryScanState(scope);
  for (;;) {
    const page = await loadSyncQueueHistoryScanPage(state, 17);
    seen.push(
      ...page.sources.flatMap((source) => (source.kind === 'operation' ? [source.operationId] : []))
    );
    state = await saveSyncQueueHistoryScanState(state, page.nextAfterKey);
    expect(await loadSyncQueueHistoryScanState(scope)).toEqual(state);
    if (!page.more) break;
  }
  expect(seen).toEqual(f.ids);
  expect(new Set(seen).size).toBe(137);
  expect(state.afterKey).toBeNull();
  expect(f.getAll.mock.calls.every(([, limit]) => limit === 18)).toBe(true);
  expect(f.table('sync_capture')).toEqual(capture);
  expect((await loadSyncQueueHistoryScanPage(state, 1)).sources).toEqual([
    { kind: 'operation', operationId: f.ids[0] },
  ]);
});
it('skips acknowledged metadata without loading captures, including a missing acknowledged capture', async () => {
  const f = await setup(3);
  const acknowledged = receipt(scope, f.ids[0]!);
  f.table('sync_outbox').set(acknowledged.key, acknowledged);
  f.table('sync_capture').delete(JSON.stringify(['change', f.ids[0]]));
  const before = structuredClone(f.rows);
  const page = await loadSyncQueueHistoryScanPage(await loadSyncQueueHistoryScanState(scope));
  expect(page.sources).toEqual(
    f.ids.slice(1).map((operationId) => ({ kind: 'operation', operationId }))
  );
  expect(f.captureReads.mock.calls.every(([key]) => key === 'profile')).toBe(true);
  expect(f.rows).toEqual(before);
});
it('advances across invalid logical sources and invalid delivery cursors without repairing evidence', async () => {
  const f = await setup(4);
  const malformedKey = queueOperationKey(scope, f.ids[0]!);
  f.table('sync_outbox').set(malformedKey, { key: malformedKey, corrupt: true });
  const invalidReceipt = receipt(scope, f.ids[1]!, 2);
  f.table('sync_outbox').set(invalidReceipt.key, invalidReceipt);
  const before = structuredClone(f.rows);
  const state = await loadSyncQueueHistoryScanState(scope);
  const page = await loadSyncQueueHistoryScanPage(state, 2);
  expect(page).toEqual({
    sources: [],
    nextAfterKey: queueOperationKey(scope, f.ids[1]!),
    more: true,
    invalidSources: 2,
  });
  expect(f.rows).toEqual(before);
  const next = await saveSyncQueueHistoryScanState(state, page.nextAfterKey);
  expect((await loadSyncQueueHistoryScanPage(next, 2)).sources).toEqual(
    f.ids.slice(2).map((operationId) => ({ kind: 'operation', operationId }))
  );
  expect(f.table('sync_outbox').get(malformedKey)).toEqual({ key: malformedKey, corrupt: true });
});
it('uses revision CAS for ordered competing saves and refuses stale page reads', async () => {
  const f = await setup(3);
  const state = await loadSyncQueueHistoryScanState(scope);
  const gate = deferred<typeof f.database>();
  io.database.mockReturnValueOnce(gate.promise);
  const delayed = saveSyncQueueHistoryScanState(state, queueOperationKey(scope, f.ids[1]!));
  const current = await saveSyncQueueHistoryScanState(state, queueOperationKey(scope, f.ids[0]!));
  const refusal = expect(delayed).rejects.toThrow('Stale');
  gate.resolve(f.database);
  await refusal;
  await expect(loadSyncQueueHistoryScanPage(state)).rejects.toThrow('Stale');
  expect(await saveSyncQueueHistoryScanState(current, current.afterKey)).toEqual(current);
  expect(await loadSyncQueueHistoryScanState(scope)).toEqual(current);
});
it('refuses delayed saves after erasure and recreation of the same identity', async () => {
  const f = await setup(2);
  const state = await loadSyncQueueHistoryScanState(scope);
  const gate = deferred<typeof f.database>();
  io.database.mockReturnValueOnce(gate.promise);
  const delayed = saveSyncQueueHistoryScanState(state, queueOperationKey(scope, f.ids[0]!));
  await runWithPersistentDataErasureBarrier(async () => {
    f.table('sync_capture').clear();
    f.table('sync_outbox').clear();
  });
  const refusal = expect(delayed).rejects.toThrow('profile changed');
  gate.resolve(f.database);
  await refusal;
  expect(f.table('sync_outbox').size).toBe(0);
  f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
  await expect(
    saveSyncQueueHistoryScanState(state, queueOperationKey(scope, f.ids[0]!))
  ).rejects.toThrow('profile changed');
  expect(await loadSyncQueueHistoryScanState({ ...scope, profileCreatedAt: 2 })).toMatchObject({
    revision: 0,
    afterKey: null,
  });
  expect(f.table('sync_outbox').size).toBe(0);
});
it('aborts failed saves, retains the previous cursor and retries the same request', async () => {
  const f = await setup(2);
  const state = await loadSyncQueueHistoryScanState(scope);
  const key = queueOperationKey(scope, f.ids[0]!);
  const before = structuredClone(f.rows);
  f.failWrites(true);
  await expect(saveSyncQueueHistoryScanState(state, key)).rejects.toThrow('No space');
  expect(f.rows).toEqual(before);
  expect(await loadSyncQueueHistoryScanState(scope)).toEqual(state);
  f.failWrites(false);
  expect(await saveSyncQueueHistoryScanState(state, key)).toEqual({
    scope,
    revision: 1,
    afterKey: key,
  });
});
it('detaches scope and state before delayed database admission', async () => {
  const f = await setup(3);
  const selectedScope = { ...scope };
  const scopeGate = deferred<typeof f.database>();
  io.database.mockReturnValueOnce(scopeGate.promise);
  const reading = loadSyncQueueHistoryScanState(selectedScope);
  selectedScope.profileCreatedAt = 99;
  scopeGate.resolve(f.database);
  const state = await reading;
  const writeGate = deferred<typeof f.database>();
  io.database.mockReturnValueOnce(writeGate.promise);
  const saving = saveSyncQueueHistoryScanState(state, queueOperationKey(scope, f.ids[0]!));
  state.scope.profileCreatedAt = 99;
  state.revision = 99;
  state.afterKey = 'foreign';
  writeGate.resolve(f.database);
  const saved = await saving;
  const pageGate = deferred<typeof f.database>();
  io.database.mockReturnValueOnce(pageGate.promise);
  const pageRead = loadSyncQueueHistoryScanPage(saved, 1);
  saved.scope.profileCreatedAt = 99;
  saved.afterKey = 'foreign';
  pageGate.resolve(f.database);
  expect((await pageRead).sources).toEqual([{ kind: 'operation', operationId: f.ids[1] }]);
});
it.each([0, -1, 129, 1.5, NaN])('refuses invalid scan limit %s before storage', async (limit) => {
  await expect(
    loadSyncQueueHistoryScanPage({ scope, revision: 0, afterKey: null }, limit)
  ).rejects.toThrow('limit');
  expect(io.database).not.toHaveBeenCalled();
});
it.each([
  { revision: -1, afterKey: null },
  { revision: 0, afterKey: '' },
  { revision: 0, afterKey: queueOperationKey({ ...scope, profileCreatedAt: 2 }, 'x') },
  { revision: 0, afterKey: queueOperationKey(scope, 'x'.repeat(4096)) },
])('refuses malformed or foreign state before storage: %s', async (partial) => {
  const state = { scope, ...partial };
  await expect(loadSyncQueueHistoryScanPage(state)).rejects.toThrow('state');
  await expect(saveSyncQueueHistoryScanState(state, null)).rejects.toThrow('state');
  expect(io.database).not.toHaveBeenCalled();
});
it('refuses invalid stored scan state and invalid next positions without mutation', async () => {
  const f = await setup();
  const state = await loadSyncQueueHistoryScanState(scope);
  io.database.mockClear();
  await expect(saveSyncQueueHistoryScanState(state, 'foreign')).rejects.toThrow('position');
  expect(io.database).not.toHaveBeenCalled();
  const key = JSON.stringify(['queue-history-scan-v1', 'space', 3, 1]);
  f.table('sync_outbox').set(key, { version: 2, kind: 'queue-history-scan', key });
  const before = structuredClone(f.rows);
  await expect(loadSyncQueueHistoryScanState(scope)).rejects.toThrow('state');
  await expect(saveSyncQueueHistoryScanState(state, null)).rejects.toThrow('state');
  expect(f.rows).toEqual(before);
});

it('advances across a malformed row whose native key is the exact scoped range prefix', async () => {
  const f = await setup(1);
  const key = queueOperationPrefix(scope);
  f.table('sync_outbox').set(key, { key, corrupt: true });
  const state = await loadSyncQueueHistoryScanState(scope);
  const page = await loadSyncQueueHistoryScanPage(state, 1);
  expect(page).toEqual({ sources: [], nextAfterKey: key, more: true, invalidSources: 1 });
  const next = await saveSyncQueueHistoryScanState(state, key);
  expect((await loadSyncQueueHistoryScanPage(next)).sources).toEqual([
    { kind: 'operation', operationId: f.ids[0] },
  ]);
});
it('propagates metadata read failures instead of counting them as malformed cursors', async () => {
  const f = await setup(1);
  const state = await loadSyncQueueHistoryScanState(scope);
  const before = structuredClone(f.rows);
  const sourceRef = queueHash(queueOperationKey(scope, f.ids[0]!));
  const failedKey = JSON.stringify(['queue-history-delivery-v1', sourceRef]);
  io.database.mockResolvedValueOnce({
    transaction(stores: string[], mode: string) {
      const tx = f.database.transaction(stores, mode);
      return {
        ...tx,
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return {
            ...store,
            get: async (key: IDBValidKey) => {
              if (key === failedKey) throw new Error('Metadata read failed');
              return store.get(key);
            },
          };
        },
      };
    },
  });
  await expect(loadSyncQueueHistoryScanPage(state)).rejects.toThrow('Metadata read failed');
  expect(f.rows).toEqual(before);
  expect(await loadSyncQueueHistoryScanState(scope)).toEqual(state);
  expect((await loadSyncQueueHistoryScanPage(state)).sources).toHaveLength(1);
});
it('drains an admitted scan save before erasure and refuses its old state afterwards', async () => {
  const f = await setup(2);
  const state = await loadSyncQueueHistoryScanState(scope);
  const entered = deferred<void>();
  const release = deferred<void>();
  io.database.mockResolvedValueOnce({
    transaction(stores: string[], mode: string) {
      const tx = f.database.transaction(stores, mode);
      return {
        abort: tx.abort,
        objectStore(name: string) {
          const store = tx.objectStore(name);
          return {
            ...store,
            get: async (key: IDBValidKey) => {
              if (name === 'sync_capture' && key === 'profile') {
                entered.resolve();
                await release.promise;
              }
              return store.get(key);
            },
          };
        },
        get done() {
          return tx.done;
        },
      };
    },
  });
  const saving = saveSyncQueueHistoryScanState(state, queueOperationKey(scope, f.ids[0]!));
  await entered.promise;
  let erased = false;
  const erasure = runWithPersistentDataErasureBarrier(async () => {
    expect(await loadSyncQueueHistoryScanState(scope)).toMatchObject({ revision: 1 });
    f.table('sync_capture').clear();
    f.table('sync_outbox').clear();
    erased = true;
  });
  expect(erased).toBe(false);
  release.resolve();
  await saving;
  await erasure;
  await expect(
    saveSyncQueueHistoryScanState(state, queueOperationKey(scope, f.ids[0]!))
  ).rejects.toThrow('profile changed');
  expect(f.table('sync_outbox').size).toBe(0);
});

it('continues operation discovery when unrelated connection source metadata is malformed', async () => {
  const f = await setup(2);
  const key = queueConnectionKey(scope);
  const malformed = { key, corrupt: true };
  f.table('sync_outbox').set(key, malformed);
  const before = structuredClone(f.rows);
  const state = await loadSyncQueueHistoryScanState(scope);
  const page = await loadSyncQueueHistoryScanPage(state, 1);
  expect(page.sources).toEqual([{ kind: 'operation', operationId: f.ids[0] }]);
  expect(f.rows).toEqual(before);
  expect(await saveSyncQueueHistoryScanState(state, page.nextAfterKey)).toMatchObject({
    revision: 1,
    afterKey: queueOperationKey(scope, f.ids[0]!),
  });
  expect(f.table('sync_outbox').get(key)).toEqual(malformed);
});
