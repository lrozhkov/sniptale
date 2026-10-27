import { reconcileSyncQueueCaptures } from './queue-reconciliation';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import type { SyncConnectionIdentity, SyncConnectionMetadata } from '../remote-connection/model';
import { captureRootKey, MAX_PENDING_CAPTURES, type CapturedChange } from './contracts';
import {
  beginSyncQueueRun,
  commandSyncQueue,
  commandSyncQueueOperation,
  failSyncQueueRun,
} from './queue';
import { queueOperationKey, type SyncQueueScope } from './queue-model';

const io = vi.hoisted(() => ({ prepared: vi.fn(), initialize: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  capturePreparedDatabase: io.prepared,
  initDB: io.initialize,
}));
const scope: SyncQueueScope = { spaceId: 'space', connectionGeneration: 3, profileCreatedAt: 1 };
const authorization: SyncConnectionIdentity = {
  incarnation: '22222222-2222-4222-8222-222222222222',
  revision: 1,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  let writesBeforeFailure: number | null = null;
  const fixture = createReviewWorkspaceStoreFixture((name) => {
    if (name !== 'sync_outbox' || writesBeforeFailure === null) return false;
    if (writesBeforeFailure > 0) {
      writesBeforeFailure -= 1;
      return false;
    }
    writesBeforeFailure = null;
    return true;
  });
  const table = (name: string) => fixture.rows.get(name)!;
  const profile = {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'space',
    connectionGeneration: 3,
  };
  const connection: SyncConnectionMetadata = {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding: {
      ...scope,
      provider: 'webdav',
      rootUrl: 'https://dav.example.test/root/',
      accountId: 'user',
    },
    identity: structuredClone(authorization),
    phase: 'active',
    updateNonce: null,
    credentialId: '44444444-4444-4444-8444-444444444444',
  };
  table('sync_capture').set('profile', profile);
  table('sync_connection').set('connection', connection);
  const capture = (id: string): CapturedChange => {
    const row: CapturedChange = {
      version: 1,
      kind: 'captured-change',
      key: JSON.stringify(['change', id]),
      createdAt: 1,
      spaceId: 'space',
      connectionGeneration: 3,
      rootKind: 'media',
      rootId: id,
      rootKey: captureRootKey('space', 'media', id),
      generation: 1,
      operationId: id,
      basis: [],
      origin: 'local-edit',
      publicationId: null,
      change: { kind: 'tombstone' },
    };
    table('sync_capture').set(row.key, structuredClone(row));
    return row;
  };
  io.prepared.mockReturnValue(fixture.database);
  io.initialize.mockResolvedValue(fixture.database);
  return {
    ...fixture,
    table,
    profile,
    connection,
    capture,
    failAfterOneWrite() {
      writesBeforeFailure = 1;
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network');
    })
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reconciles retained captures idempotently without changing sources or using network', async () => {
  const f = setup();
  f.capture('media');
  f.capture('project');
  const sources = structuredClone(f.table('sync_capture'));
  const suppliedScope = structuredClone(scope);
  const suppliedAuthorization = structuredClone(authorization);
  const pending = reconcileSyncQueueCaptures(suppliedScope, suppliedAuthorization);
  suppliedScope.profileCreatedAt = 9;
  suppliedAuthorization.revision = 9;
  expect(await pending).toEqual({ enqueued: 2, existing: 0, refused: 0 });
  const rows = structuredClone(f.rows);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 2,
    refused: 0,
  });
  expect(f.rows).toEqual(rows);
  expect(f.table('sync_capture')).toEqual(sources);
  expect(io.initialize).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['scope', 'authorization', 'disabled', 'paused', 'missing'] as const)(
  'refuses reconciliation with changed %s authority',
  async (kind) => {
    const f = setup();
    f.capture('op');
    if (kind === 'scope') f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
    if (kind === 'authorization')
      f.table('sync_connection').set('connection', {
        ...f.connection,
        identity: { ...authorization, revision: 2 },
      });
    if (kind === 'disabled')
      f.table('sync_capture').set('profile', { ...f.profile, enabled: false });
    if (kind === 'paused')
      f.table('sync_connection').set('connection', { ...f.connection, phase: 'paused' });
    if (kind === 'missing') f.table('sync_connection').delete('connection');
    const before = structuredClone(f.rows);
    await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toThrow();
    expect(f.rows).toEqual(before);
  }
);
it.each(['paused', 'failed'] as const)(
  'preserves %s controls deadlines and complete history on duplicate admission',
  async (status) => {
    const f = setup();
    f.capture('op');
    await reconcileSyncQueueCaptures(scope, authorization);
    if (status === 'paused') await commandSyncQueueOperation(scope, 'op', 1, 'pause');
    else {
      const run = await beginSyncQueueRun(scope, 'op', 1, authorization);
      await failSyncQueueRun(run, 'temporary');
    }
    await commandSyncQueue(scope, 1, 'pause');
    const before = structuredClone(f.rows);
    expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
      enqueued: 0,
      existing: 1,
      refused: 0,
    });
    expect(f.rows).toEqual(before);
  }
);
it('does not let malformed captures suppress independent valid captures', async () => {
  const f = setup();
  const bad = f.capture('bad');
  f.table('sync_capture').set(bad.key, { ...bad, version: 999 });
  f.capture('valid');
  const before = structuredClone(f.table('sync_capture'));
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 0,
    refused: 1,
  });
  expect(f.table('sync_outbox').has(queueOperationKey(scope, 'valid'))).toBe(true);
  expect(f.table('sync_capture')).toEqual(before);
});
it('refuses nonstring native primary keys while admitting independent string keys', async () => {
  const f = setup();
  const valid = f.capture('valid');
  const original = f.database.transaction.bind(f.database);
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    if (mode !== 'readonly') return tx;
    const objectStore = tx.objectStore.bind(tx);
    vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
      const store = objectStore(name);
      if (name === 'sync_capture') {
        const index = store.index;
        vi.spyOn(store, 'index').mockImplementation((name) => {
          const value = index(name);
          vi.spyOn(value, 'getAllKeys').mockResolvedValue([['unexpected'], valid.key]);
          return value;
        });
      }
      return store;
    });
    return tx;
  });
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 0,
    refused: 1,
  });
  expect(f.table('sync_outbox').has(queueOperationKey(scope, 'valid'))).toBe(true);
});
it('refuses changed retained capture joins without repairing existing queue evidence', async () => {
  const f = setup();
  const row = f.capture('op');
  await reconcileSyncQueueCaptures(scope, authorization);
  f.table('sync_capture').set(row.key, { ...row, createdAt: 2 });
  const before = structuredClone(f.rows);
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 0,
    existing: 0,
    refused: 1,
  });
  expect(f.rows).toEqual(before);
});
it('bounds discovery to 129 primary keys and refuses oversized state before body reads', async () => {
  const f = setup();
  for (let index = 0; index < MAX_PENDING_CAPTURES + 2; index += 1) f.capture(`op-${index}`);
  const boundedReads: { key: IDBValidKey; count: number | undefined }[] = [];
  const bodyReads: IDBValidKey[] = [];
  const original = f.database.transaction.bind(f.database);
  const transactions = vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    const objectStore = tx.objectStore.bind(tx);
    vi.spyOn(tx, 'objectStore').mockImplementation((name) => {
      const store = objectStore(name);
      if (name === 'sync_capture') {
        const get = store.get;
        vi.spyOn(store, 'get').mockImplementation((key) => {
          bodyReads.push(key);
          return get(key);
        });
        const index = store.index;
        vi.spyOn(store, 'index').mockImplementation((name) => {
          const value = index(name);
          const getAllKeys = value.getAllKeys;
          vi.spyOn(value, 'getAllKeys').mockImplementation((key, count) => {
            boundedReads.push({ key, count });
            return getAllKeys(key, count);
          });
          return value;
        });
      }
      return store;
    });
    return tx;
  });
  const before = structuredClone(f.rows);
  await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toThrow('limit');
  expect(transactions).toHaveBeenCalledTimes(1);
  expect(boundedReads).toEqual([{ key: 'captured-change', count: 129 }]);
  expect(bodyReads.every((key) => key === 'profile')).toBe(true);
  expect(f.rows).toEqual(before);
});
it('retains completed admissions after a later write failure and retries only missing work', async () => {
  const f = setup();
  f.capture('first');
  f.capture('second');
  f.capture('third');
  const original = f.database.transaction.bind(f.database);
  let writes = 0;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    if (mode === 'readwrite' && ++writes === 2) f.failAfterOneWrite();
    return original(stores, mode);
  });
  const sources = structuredClone(f.table('sync_capture'));
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 2,
    existing: 0,
    refused: 1,
  });
  const first = structuredClone(f.table('sync_outbox').get(queueOperationKey(scope, 'first')));
  expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
    enqueued: 1,
    existing: 2,
    refused: 0,
  });
  expect(f.table('sync_outbox').get(queueOperationKey(scope, 'first'))).toEqual(first);
  expect(f.table('sync_capture')).toEqual(sources);
});
it.each(['profile', 'authorization', 'disabled'] as const)(
  'rechecks %s between item transactions and preserves earlier admissions',
  async (kind) => {
    const f = setup();
    f.capture('first');
    f.capture('second');
    const original = f.database.transaction.bind(f.database);
    let writes = 0;
    vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
      if (mode === 'readwrite' && ++writes === 2) {
        if (kind === 'profile')
          f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
        if (kind === 'disabled')
          f.table('sync_capture').set('profile', { ...f.profile, enabled: false });
        if (kind === 'authorization')
          f.table('sync_connection').set('connection', {
            ...f.connection,
            identity: { ...authorization, revision: 2 },
          });
      }
      return original(stores, mode);
    });
    expect(await reconcileSyncQueueCaptures(scope, authorization)).toEqual({
      enqueued: 1,
      existing: 0,
      refused: 1,
    });
    expect(f.table('sync_outbox').has(queueOperationKey(scope, 'first'))).toBe(true);
    expect(f.table('sync_outbox').has(queueOperationKey(scope, 'second'))).toBe(false);
  }
);
it.each(['profile', 'database'] as const)(
  'refuses delayed reconciliation after %s erasure and recreation',
  async (kind) => {
    const f = setup();
    f.capture('op');
    const entered = deferred();
    const release = deferred();
    const blocker = runWithExclusivePersistenceMutationPermit(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const pending = reconcileSyncQueueCaptures(scope, authorization);
    const refusal = expect(pending).rejects.toThrow();
    let replacement: ReturnType<typeof createReviewWorkspaceStoreFixture> | null = null;
    if (kind === 'profile') f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
    else {
      replacement = createReviewWorkspaceStoreFixture(() => false);
      replacement.rows.clear();
      for (const [name, values] of structuredClone(f.rows)) replacement.rows.set(name, values);
      io.prepared.mockReturnValue(replacement.database);
      io.initialize.mockResolvedValue(replacement.database);
      vi.spyOn(f.database, 'transaction').mockImplementation(() => {
        throw new DOMException('Closed database', 'InvalidStateError');
      });
    }
    const before = structuredClone(f.rows);
    release.resolve();
    await blocker;
    await refusal;
    expect(f.rows).toEqual(before);
    if (replacement) expect(replacement.rows).toEqual(before);
    expect(io.prepared).toHaveBeenCalledTimes(1);
    expect(io.initialize).not.toHaveBeenCalled();
  }
);
it('refuses cold storage and invalid detached inputs without initializing a database', async () => {
  setup();
  io.prepared.mockReturnValue(null);
  await expect(reconcileSyncQueueCaptures(scope, authorization)).rejects.toThrow();
  await expect(reconcileSyncQueueCaptures({}, authorization)).rejects.toThrow();
  await expect(reconcileSyncQueueCaptures(scope, {})).rejects.toThrow();
  expect(io.initialize).not.toHaveBeenCalled();
});
