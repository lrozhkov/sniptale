import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { materializeDueSyncCheckpoints } from './checkpoint-schedule';
import { acquireSyncCheckpointEdit } from './checkpoint-publication';
import { captureRootKey, pendingCheckpointKey, type SyncPendingCheckpoint } from './contracts';
import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import { createProjectMutationStores } from '../projects/mutation-stores';
import { createVideoProjectEntry } from '../projects/index.test-support';
import { parseSyncCaptureRecord } from './guards';
import { parseSyncQueueConnection, queueConnectionKey } from './queue-model';
import {
  scope,
  authorization,
  deferred,
  createReconciliationFixture,
  installReconciliationKeyRanges,
} from './queue-reconciliation.test-support';
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';

const io = vi.hoisted(() => ({ prepared: vi.fn(), capture: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  capturePreparedDatabase: io.prepared,
}));
vi.mock('./capture', () => ({ captureRootCheckpointInTransaction: io.capture }));

function setup() {
  const f = createReconciliationFixture();
  io.prepared.mockReturnValue(f.database);
  io.capture.mockImplementation(async (tx, expected) => {
    const store = tx.objectStore('sync_capture');
    const current = await store.get(expected.key);
    if (!current || current.revision !== expected.revision) return null;
    await store.delete(expected.key);
    const operation = { key: `completed:${expected.rootId}`, operationId: expected.rootId };
    await store.put(operation);
    return operation;
  });
  return f;
}
function pending(f: ReturnType<typeof setup>, id: string, dueAt = 0) {
  const rootKey = captureRootKey(scope.spaceId, 'video-project', id);
  const row: SyncPendingCheckpoint = {
    version: 1,
    kind: 'pending-checkpoint',
    key: pendingCheckpointKey(rootKey),
    createdAt: 0,
    ...scope,
    rootKind: 'video-project',
    rootId: id,
    rootKey,
    revision: crypto.randomUUID(),
    dueAt,
  };
  f.table('sync_capture').set(row.key, row);
  return row;
}
function progress(f: ReturnType<typeof setup>) {
  return parseSyncQueueConnection(f.table('sync_outbox').get(queueConnectionKey(scope)))
    ?.checkpointProgress;
}
beforeEach(() => {
  vi.clearAllMocks();
  installReconciliationKeyRanges();
  const installed = globalThis.IDBKeyRange;
  vi.stubGlobal('IDBKeyRange', {
    ...installed,
    bound: (lower: string, upper: string, lowerOpen = false, upperOpen = false) => ({
      lower,
      upper,
      lowerOpen,
      upperOpen,
    }),
  });
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

it('continues 130 independent roots across bounded restartable pages', async () => {
  const f = setup();
  for (let n = 0; n < 130; n++) pending(f, String(n).padStart(3, '0'));
  // Unrelated retained capture keys must not consume the metadata budget.
  for (let n = 0; n < 100; n++) f.capture(`other-${n}`);
  let total = 0;
  for (let page = 0; page < 9; page++) {
    const result = await materializeDueSyncCheckpoints(scope, authorization);
    expect(result.captured).toBeLessThanOrEqual(16);
    total += result.captured;
    expect(result.remaining).toBe(page < 8);
    if (!result.remaining) break;
  }
  expect(total).toBe(130);
  expect(progress(f)?.afterKey).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it('skips future and blocked roots without suppressing due suffixes', async () => {
  const f = setup();
  for (let n = 0; n < 65; n++) pending(f, `a-${String(n).padStart(2, '0')}`, Date.now() + 60000);
  const blocked = pending(f, 'b-blocked');
  const malformed = pending(f, 'c-malformed');
  f.table('sync_capture').set(malformed.key, { ...malformed, revision: 'invalid' });
  pending(f, 'd-due');
  io.capture.mockImplementationOnce(async () => null);
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({
    captured: 0,
    remaining: true,
  });
  expect(io.capture).not.toHaveBeenCalled();
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({
    captured: 1,
    refused: 1,
    remaining: false,
  });
  expect(f.table('sync_capture').has(blocked.key)).toBe(true);
  expect(progress(f)?.afterKey).toBeNull();
});

it('retains completed captures when progress fails and retries without duplicates', async () => {
  const f = setup();
  const row = pending(f, 'due');
  f.failNextProgressWrite();
  await expect(materializeDueSyncCheckpoints(scope, authorization)).rejects.toThrow();
  expect(f.table('sync_capture').has(row.key)).toBe(false);
  expect(f.table('sync_capture').has('completed:due')).toBe(true);
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({
    captured: 0,
    remaining: false,
  });
  expect(io.capture).toHaveBeenCalledOnce();
});

it('rolls back a failed native checkpoint and continues independent roots', async () => {
  const f = setup();
  const bad = pending(f, 'a-bad');
  pending(f, 'b-good');
  io.capture.mockImplementationOnce(async (tx, expected) => {
    await tx.objectStore('sync_capture').delete(expected.key);
    throw new Error('Capture failed');
  });
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({
    captured: 1,
    refused: 1,
  });
  expect(f.table('sync_capture').has(bad.key)).toBe(true);
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({ captured: 1 });
});

it.each(['profile', 'authorization', 'paused', 'database'] as const)(
  'refuses delayed work after authority replacement: %s',
  async (kind) => {
    const f = setup();
    const row = pending(f, 'due');
    const entered = deferred();
    const release = deferred();
    const blocker = runWithExclusivePersistenceMutationPermit(async () => {
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const command = materializeDueSyncCheckpoints(scope, authorization);
    const refusal = expect(command).rejects.toThrow();
    if (kind === 'profile') f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
    if (kind === 'authorization')
      f.table('sync_connection').set('connection', {
        ...f.connection,
        identity: { ...authorization, revision: 2 },
      });
    if (kind === 'paused')
      f.table('sync_connection').set('connection', { ...f.connection, phase: 'paused' });
    if (kind === 'database')
      vi.spyOn(f.database, 'transaction').mockImplementation(() => {
        throw new Error('Closed database');
      });
    release.resolve();
    await blocker;
    await refusal;
    expect(f.table('sync_capture').has(row.key)).toBe(true);
    expect(io.capture).not.toHaveBeenCalled();
    expect(io.prepared).toHaveBeenCalledOnce();
  }
);

it('admits one checkpoint across parallel scheduler passes', async () => {
  const f = setup();
  installSharedEditLocks();
  pending(f, 'due');
  // The shared fixture clones transactions immediately. Hold the second discovery's
  // requests until the first native commit to model overlapping IDB store ordering.
  const committed = deferred();
  const original = f.database.transaction.bind(f.database);
  let discoveries = 0;
  let native = 0;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    if (mode === 'readonly' && ++discoveries === 2) {
      return {
        ...tx,
        objectStore(name) {
          const store = tx.objectStore(name);
          return {
            ...store,
            get: async (key) => {
              await committed.promise;
              return store.get(key);
            },
          };
        },
      };
    }
    if (mode === 'readwrite' && stores.includes('video_projects') && ++native === 1) {
      return {
        abort: () => tx.abort(),
        objectStore: tx.objectStore.bind(tx),
        get done() {
          const result = tx.done;
          committed.resolve();
          return result;
        },
      };
    }
    return tx;
  });
  const results = await Promise.all([
    materializeDueSyncCheckpoints(scope, authorization),
    materializeDueSyncCheckpoints(scope, authorization),
  ]);
  expect(results.reduce((sum, row) => sum + row.captured, 0)).toBe(1);
  expect(f.table('sync_capture').has('completed:due')).toBe(true);
});

it('refuses stale pending selections after discovery', async () => {
  const f = setup();
  const row = pending(f, 'due');
  const replacement = { ...row, revision: crypto.randomUUID() };
  const original = f.database.transaction.bind(f.database);
  let replaced = false;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    if (!replaced && mode === 'readwrite') {
      replaced = true;
      f.table('sync_capture').set(row.key, replacement);
    }
    return original(stores, mode);
  });
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({ captured: 0 });
  expect(f.table('sync_capture').get(row.key)).toEqual(replacement);
});

it('restarts progress for a new authorization and rejects a paused queue', async () => {
  const f = setup();
  pending(f, 'due');
  const key = queueConnectionKey(scope);
  f.table('sync_outbox').set(key, {
    ...scope,
    version: 1,
    kind: 'queue-connection',
    key,
    revision: 0,
    paused: false,
    scheduleProgress: null,
    eventSequence: 0,
    pendingTransitions: [],
    droppedTransitions: 0,
    checkpointProgress: {
      authorization: { ...authorization, revision: 2 },
      revision: 7,
      afterKey: '["pending-checkpoint",\"z\"]',
    },
  });
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({ captured: 1 });
  const connection = parseSyncQueueConnection(f.table('sync_outbox').get(key))!;
  expect(connection.checkpointProgress?.authorization).toEqual(authorization);
  f.table('sync_outbox').set(key, { ...connection, paused: true });
  await expect(materializeDueSyncCheckpoints(scope, authorization)).rejects.toThrow();
});

it('materializes a real native project through the shared capture transaction owner', async () => {
  const f = setup();
  const row = pending(f, 'native-project');
  const entry = createVideoProjectEntry({ id: row.rootId, name: 'Latest local edit' });
  f.table('video_projects').set(row.rootId, entry);
  const native = await vi.importActual<typeof import('./capture')>('./capture');
  io.capture.mockImplementation(native.captureRootCheckpointInTransaction);
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({
    captured: 1,
    refused: 0,
  });
  expect(f.table('sync_capture').has(row.key)).toBe(false);
  const captures = [...f.table('sync_capture').values()]
    .map(parseSyncCaptureRecord)
    .filter((value) => value?.kind === 'sync-operation');
  expect(captures).toHaveLength(1);
  expect(captures[0]).toMatchObject({
    phase: 'native',
    rootId: row.rootId,
    change: {
      kind: 'video-project',
      rows: { project: { project: { name: 'Latest local edit' } } },
    },
  });
  expect(f.table('video_projects').get(row.rootId)).toEqual(entry);
});

it('includes causal publication lookup and reserves connection admission for checkpoint transactions', () => {
  const f = setup();
  const transaction = vi.spyOn(f.database, 'transaction');
  const db = capturePreparedDatabase();
  if (!db) throw new Error('Expected prepared scheduler test database.');
  createProjectMutationStores(db);
  createProjectMutationStores(db, { checkpointAdmission: true });
  expect(transaction.mock.calls[0]![0]).toContain('sync_outbox');
  expect(transaction.mock.calls[0]![0]).not.toContain('sync_connection');
  expect(transaction.mock.calls[1]![0]).toEqual(
    expect.arrayContaining([
      'sync_outbox',
      'sync_connection',
      'image_workspaces',
      'video_workspaces',
      'scenario_projects',
    ])
  );
});

it.each(['profile', 'authorization', 'paused'] as const)(
  'rechecks %s between roots and retains earlier captures',
  async (kind) => {
    const f = setup();
    pending(f, 'a-first');
    const later = pending(f, 'b-later');
    const original = f.database.transaction.bind(f.database);
    let roots = 0;
    vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
      if (mode === 'readwrite' && stores.includes('video_projects') && ++roots === 2) {
        if (kind === 'profile')
          f.table('sync_capture').set('profile', { ...f.profile, createdAt: 2 });
        if (kind === 'authorization')
          f.table('sync_connection').set('connection', {
            ...f.connection,
            identity: { ...authorization, revision: 2 },
          });
        if (kind === 'paused')
          f.table('sync_connection').set('connection', { ...f.connection, phase: 'paused' });
      }
      return original(stores, mode);
    });
    await expect(materializeDueSyncCheckpoints(scope, authorization)).rejects.toThrow();
    expect(f.table('sync_capture').has('completed:a-first')).toBe(true);
    expect(f.table('sync_capture').has(later.key)).toBe(true);
  }
);

function installSharedEditLocks() {
  let editors = 0;
  let publishing = false;
  const waiting: Array<() => void> = [];
  const names: string[] = [];
  vi.stubGlobal('navigator', {
    locks: {
      request: async (
        name: string,
        options: { mode: 'shared' | 'exclusive' },
        callback: (lock: object | null) => Promise<unknown> | unknown
      ) => {
        names.push(name);
        if (name !== 'sniptale:sync:checkpoint-publication') return callback({});
        if (options.mode === 'exclusive') {
          if (editors || publishing) return callback(null);
          publishing = true;
          try {
            return await callback({});
          } finally {
            publishing = false;
            for (const resume of waiting.splice(0)) resume();
          }
        }
        if (publishing) await new Promise<void>((resolve) => waiting.push(resolve));
        editors++;
        try {
          return await callback({});
        } finally {
          editors--;
        }
      },
    },
  });
  return names;
}

it('retains the newest pending revision and progress while two editor leases are held', async () => {
  const f = setup();
  const row = pending(f, 'held');
  const names = installSharedEditLocks();
  const first = await acquireSyncCheckpointEdit();
  const second = await acquireSyncCheckpointEdit();
  const snapshot = structuredClone([...f.table('sync_outbox')]);
  const replacement = { ...row, revision: crypto.randomUUID() };
  f.table('sync_capture').set(row.key, replacement);
  const empty = { captured: 0, skipped: 0, refused: 0, remaining: false, advanced: false };
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toEqual(empty);
  await first.release();
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toEqual(empty);
  expect([...f.table('sync_outbox')]).toEqual(snapshot);
  expect(f.table('sync_capture').get(row.key)).toEqual(replacement);
  expect(io.capture).not.toHaveBeenCalled();
  // Reenrollment never selects a different publication lock from an existing editor.
  expect(new Set(names)).toEqual(new Set(['sniptale:sync:checkpoint-publication']));
  await second.release();
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({ captured: 1 });
  expect(io.capture.mock.calls[0]![1]).toEqual(replacement);
});

it('does not freeze a dirty dependency while an unrelated editor holds publication admission', async () => {
  const f = setup();
  const parent = pending(f, 'parent');
  const dependency = pending(f, 'dependency');
  installSharedEditLocks();
  const edit = await acquireSyncCheckpointEdit();
  io.capture.mockImplementation(async (tx, expected) => {
    // The existing native capture recursively freezes pending dependencies in this transaction.
    await tx.objectStore('sync_capture').delete(dependency.key);
    await tx.objectStore('sync_capture').delete(expected.key);
    return { operationId: expected.rootId };
  });
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({ captured: 0 });
  expect(io.capture).not.toHaveBeenCalled();
  expect(f.table('sync_capture').has(dependency.key)).toBe(true);
  expect(f.table('sync_capture').has(parent.key)).toBe(true);
  await edit.release();
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({ captured: 2 });
});

it('does not enter native storage when Chrome publication coordination is unavailable', async () => {
  const f = setup();
  const row = pending(f, 'held');
  const transaction = vi.spyOn(f.database, 'transaction');
  vi.stubGlobal('chrome', {});
  vi.stubGlobal('navigator', {});
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toEqual({
    captured: 0,
    skipped: 0,
    refused: 0,
    remaining: false,
    advanced: false,
  });
  expect(transaction).not.toHaveBeenCalled();
  expect(f.table('sync_capture').get(row.key)).toEqual(row);
});

it('releases publication after one native transaction so an editor can interrupt the bounded suffix', async () => {
  const f = setup();
  pending(f, 'a-first');
  const later = pending(f, 'b-later');
  installSharedEditLocks();
  let edit: Promise<Awaited<ReturnType<typeof acquireSyncCheckpointEdit>>> | undefined;
  io.capture.mockImplementationOnce(async (tx, expected) => {
    edit = acquireSyncCheckpointEdit();
    await tx.objectStore('sync_capture').delete(expected.key);
    return { operationId: expected.rootId };
  });
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toEqual({
    captured: 1,
    skipped: 0,
    refused: 0,
    remaining: false,
    advanced: false,
  });
  expect(progress(f)).toBeUndefined();
  expect(f.table('sync_capture').has(later.key)).toBe(true);
  if (!edit) throw new Error('Expected an editor acquisition during capture.');
  const lease = await edit;
  await lease.release();
  expect(await materializeDueSyncCheckpoints(scope, authorization)).toMatchObject({ captured: 1 });
});

it('reports bounded preparing and committed aggregate checkpoint reasons without source identities', async () => {
  const f = setup();
  const due = pending(f, 'private-root-title');
  pending(f, 'future', Date.now() + 60_000);
  const foreign = pending(f, 'foreign');
  f.table('sync_capture').set(foreign.key, { ...foreign, connectionGeneration: 4 });
  const invalid = pending(f, 'invalid');
  f.table('sync_capture').set(invalid.key, { ...invalid, revision: 'not-a-revision' });
  f.table('video_projects').set(
    due.rootId,
    createVideoProjectEntry({ id: due.rootId, name: 'private credential endpoint' })
  );
  const native = await vi.importActual<typeof import('./capture')>('./capture');
  io.capture.mockImplementation(native.captureRootCheckpointInTransaction);
  const observe = vi.fn();
  await expect(materializeDueSyncCheckpoints(scope, authorization, observe)).resolves.toMatchObject(
    { captured: 1, refused: 1, skipped: 2 }
  );
  expect(observe).toHaveBeenCalledTimes(2);
  expect(observe.mock.calls[0]).toEqual([{ phase: 'preparing' }]);
  expect(observe.mock.calls[1]).toEqual([
    expect.objectContaining({
      phase: 'settled',
      counts: expect.objectContaining({
        capturedRoots: 1,
        acknowledgedRoots: 1,
        deadlineWaitingRoots: 1,
        scopeMismatchRoots: 1,
        invalidPendingRoots: 1,
      }),
    }),
  ]);
  expect(JSON.stringify(observe.mock.calls)).not.toContain('private');
  expect(JSON.stringify(observe.mock.calls)).not.toContain(due.revision);
});
it('reports publication contention without reading or changing native pending work', async () => {
  const f = setup();
  pending(f, 'private-root');
  installSharedEditLocks();
  const edit = await acquireSyncCheckpointEdit();
  const snapshot = structuredClone(f.rows);
  const observe = vi.fn();
  try {
    await materializeDueSyncCheckpoints(scope, authorization, observe);
    expect(observe).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        phase: 'settled',
        counts: expect.objectContaining({ publicationBusyPasses: 1, acknowledgedRoots: 0 }),
      })
    );
    expect(f.rows).toEqual(snapshot);
  } finally {
    await edit.release();
  }
});
it('does not announce an aborted tentative acknowledgement and keeps later roots independent', async () => {
  const f = setup();
  const bad = pending(f, 'a-bad');
  pending(f, 'b-good');
  io.capture.mockImplementationOnce(async (tx, row, options) => {
    await tx.objectStore('sync_capture').delete(row.key);
    options.onOutcome?.('acknowledged');
    throw new Error('private credential endpoint');
  });
  const observe = vi.fn();
  await expect(materializeDueSyncCheckpoints(scope, authorization, observe)).resolves.toMatchObject(
    { captured: 1, refused: 1 }
  );
  expect(observe).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: 'settled',
      counts: expect.objectContaining({ acknowledgedRoots: 1, captureFailedRoots: 1 }),
    })
  );
  expect(f.table('sync_capture').has(bad.key)).toBe(true);
  expect(JSON.stringify(observe.mock.calls)).not.toContain('private');
});

it(
  'distinguishes a changed pending revision from a predecessor awaiting publication ' +
    'using native branches',
  async () => {
    const f = setup();
    const stale = pending(f, 'a-stale');
    const blocked = pending(f, 'b-blocked');
    f.table('video_projects').set(blocked.rootId, createVideoProjectEntry({ id: blocked.rootId }));
    const rootStateKey = JSON.stringify(['root-state', blocked.rootKey]);
    f.table('sync_capture').set(rootStateKey, {
      version: 1,
      kind: 'root-state',
      key: rootStateKey,
      createdAt: 1,
      spaceId: scope.spaceId,
      rootKind: blocked.rootKind,
      rootId: blocked.rootId,
      rootKey: blocked.rootKey,
      generation: 1,
      basis: ['unpublished-predecessor'],
    });
    const original = f.database.transaction.bind(f.database);
    let replaced = false;
    vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
      if (!replaced && mode === 'readwrite' && stores.includes('video_projects')) {
        replaced = true;
        f.table('sync_capture').set(stale.key, { ...stale, revision: crypto.randomUUID() });
      }
      return original(stores, mode);
    });
    const native = await vi.importActual<typeof import('./capture')>('./capture');
    io.capture.mockImplementation(native.captureRootCheckpointInTransaction);
    const observe = vi.fn();
    await expect(
      materializeDueSyncCheckpoints(scope, authorization, observe)
    ).resolves.toMatchObject({ captured: 0, skipped: 2, refused: 0 });
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'settled',
        counts: expect.objectContaining({
          revisionChangedRoots: 1,
          predecessorWaitingRoots: 1,
          acknowledgedRoots: 0,
        }),
      })
    );
    expect(f.table('sync_capture').has(stale.key)).toBe(true);
    expect(f.table('sync_capture').has(blocked.key)).toBe(true);
  }
);
it('acknowledges a consumed native checkpoint even when no new capture is needed', async () => {
  const f = setup();
  const row = pending(f, 'temporary');
  const project = createVideoProjectEntry(
    { id: row.rootId },
    { lifecycle: createLibraryLifecycle('temporary', 1) }
  );
  f.table('video_projects').set(row.rootId, project);
  const native = await vi.importActual<typeof import('./capture')>('./capture');
  io.capture.mockImplementation(native.captureRootCheckpointInTransaction);
  const observe = vi.fn();
  await expect(materializeDueSyncCheckpoints(scope, authorization, observe)).resolves.toMatchObject(
    { captured: 0, skipped: 1 }
  );
  expect(observe).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: 'settled',
      counts: expect.objectContaining({ capturedRoots: 0, acknowledgedRoots: 1, deferredRoots: 0 }),
    })
  );
  expect(f.table('sync_capture').has(row.key)).toBe(false);
  expect(f.table('video_projects').get(row.rootId)).toEqual(project);
});
it('does not acknowledge tentative capture before a rejected transaction completion', async () => {
  const f = setup();
  const row = pending(f, 'a-failed-commit');
  pending(f, 'b-independent');
  const original = f.database.transaction.bind(f.database);
  let failed = false;
  vi.spyOn(f.database, 'transaction').mockImplementation((stores, mode) => {
    const tx = original(stores, mode);
    if (!failed && mode === 'readwrite' && stores.includes('video_projects')) {
      failed = true;
      return {
        abort: () => tx.abort(),
        objectStore: tx.objectStore.bind(tx),
        get done() {
          return Promise.reject(new Error('private commit detail'));
        },
      };
    }
    return tx;
  });
  const observe = vi.fn();
  await expect(materializeDueSyncCheckpoints(scope, authorization, observe)).resolves.toMatchObject(
    { captured: 1, refused: 1 }
  );
  expect(observe).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: 'settled',
      counts: expect.objectContaining({
        acknowledgedRoots: 1,
        capturedRoots: 1,
        captureFailedRoots: 1,
      }),
    })
  );
  expect(f.table('sync_capture').has(row.key)).toBe(true);
  expect(f.table('sync_capture').has('completed:b-independent')).toBe(true);
});
it('does not let throwing native or scheduler observers change capture and continuation', async () => {
  const f = setup();
  const row = pending(f, 'native');
  f.table('video_projects').set(row.rootId, createVideoProjectEntry({ id: row.rootId }));
  const native = await vi.importActual<typeof import('./capture')>('./capture');
  const db = capturePreparedDatabase();
  if (!db) throw new Error('Expected prepared scheduler test database.');
  const { tx } = createProjectMutationStores(db, { checkpointAdmission: true });
  const capture = await native.captureRootCheckpointInTransaction(tx, row, {
    force: true,
    onOutcome: () => {
      throw new Error('private diagnostic detail');
    },
  });
  await tx.done;
  expect(capture).not.toBeNull();
  expect(f.table('sync_capture').has(row.key)).toBe(false);
  pending(f, 'later');
  await expect(
    materializeDueSyncCheckpoints(scope, authorization, () => {
      throw new Error('private observer detail');
    })
  ).resolves.toMatchObject({ captured: 1 });
  expect(f.table('sync_capture').has('completed:later')).toBe(true);
});
it('reports admission refusal separately and stays silent for an empty successful pass', async () => {
  const f = setup();
  const observe = vi.fn();
  await materializeDueSyncCheckpoints(scope, authorization, observe);
  expect(observe).not.toHaveBeenCalled();
  f.table('sync_connection').set('connection', { ...f.connection, phase: 'paused' });
  await expect(materializeDueSyncCheckpoints(scope, authorization, observe)).rejects.toThrow();
  expect(observe).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      phase: 'settled',
      counts: expect.objectContaining({ admissionRefusedPasses: 1, acknowledgedRoots: 0 }),
    })
  );
});

it(
  'keeps committed captures acknowledged when a later progress write fails without ' +
    'mislabeling admission',
  async () => {
    const f = setup();
    pending(f, 'committed');
    f.failNextProgressWrite();
    const observe = vi.fn();
    await expect(materializeDueSyncCheckpoints(scope, authorization, observe)).rejects.toThrow();
    expect(observe).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'settled',
        counts: expect.objectContaining({
          capturedRoots: 1,
          acknowledgedRoots: 1,
          admissionRefusedPasses: 0,
          failedPasses: 1,
        }),
      })
    );
    expect(f.table('sync_capture').has('completed:committed')).toBe(true);
  }
);
