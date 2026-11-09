import { parseConnectionMetadata } from '../remote-connection/model';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWorkspaceStoreFixture } from '../review-workspaces/store.test-support';
import { captureRootKey, pendingCheckpointKey, type SyncPendingCheckpoint } from './contracts';
import { queueConnectionKey } from './queue-model';
import { parseSyncCaptureRecord } from './guards';
import { deferCheckpointInTransaction, consumeCheckpointInTransaction } from './checkpoints';
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  createReconciliationFixture,
  installReconciliationKeyRanges,
  scope,
  authorization,
} from './queue-reconciliation.test-support';
import {
  requestSyncCheckpointExit,
  readSyncCheckpointInterval,
  requestSyncCheckpointFlush,
  updateSyncCheckpointInterval,
} from './checkpoint-commands';

const io = vi.hoisted(() => ({ prepared: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  capturePreparedDatabase: io.prepared,
}));
function setup() {
  const base = createReconciliationFixture();
  let writes: number | null = null;
  const f = createReviewWorkspaceStoreFixture((name) => {
    if (name !== 'sync_capture' || writes === null) return false;
    if (writes-- > 0) return false;
    writes = null;
    return true;
  });
  for (const [name, rows] of base.rows) f.rows.set(name, structuredClone(rows));
  io.prepared.mockReturnValue(f.database);
  const table = (name: string) => f.rows.get(name)!;
  return {
    ...f,
    table,
    failNextCaptureWrite: () => {
      writes = 0;
    },
    failAfterOneWrite: () => {
      writes = 1;
    },
  };
}
function pending(f: ReturnType<typeof setup>, id: string, dueAt = 301000) {
  const rootKey = captureRootKey(scope.spaceId, 'video-project', id);
  const row: SyncPendingCheckpoint = {
    ...scope,
    rootKind: 'video-project',
    rootId: id,
    rootKey,
    key: pendingCheckpointKey(rootKey),
    version: 1,
    kind: 'pending-checkpoint',
    createdAt: 1000,
    dueAt,
    revision: crypto.randomUUID(),
  };
  f.table('sync_capture').set(row.key, row);
  return row;
}
beforeEach(() => {
  vi.clearAllMocks();
  installReconciliationKeyRanges();
  vi.stubGlobal('IDBKeyRange', {
    ...globalThis.IDBKeyRange,
    bound: (lower: string, upper: string, lowerOpen = false) => ({
      lower,
      upper,
      lowerOpen,
      upperOpen: false,
    }),
  });
  vi.spyOn(Date, 'now').mockReturnValue(10000);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network.');
    })
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reschedules 130 pending roots atomically when the interval changes', async () => {
  const f = setup();
  const rows = Array.from({ length: 130 }, (_, n) => pending(f, String(n)));
  expect(await updateSyncCheckpointInterval(scope, 60000)).toEqual({
    intervalMs: 60000,
    updated: 130,
  });
  expect(f.table('sync_capture').get('profile')).toMatchObject({ checkpointIntervalMs: 60000 });
  for (const row of rows) {
    expect(f.table('sync_capture').get(row.key)).toMatchObject({ dueAt: 61000, createdAt: 1000 });
    expect(f.table('sync_capture').get(row.key)).not.toEqual(row);
  }
  expect(await updateSyncCheckpointInterval(scope, 3600000)).toEqual({
    intervalMs: 3600000,
    updated: 130,
  });
  for (const row of rows)
    expect(f.table('sync_capture').get(row.key)).toMatchObject({ dueAt: 3601000 });
  expect(await updateSyncCheckpointInterval(scope, 3600000)).toEqual({
    intervalMs: 3600000,
    updated: 0,
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves all native state when policy persistence fails', async () => {
  const f = setup();
  pending(f, 'first');
  pending(f, 'second');
  const before = structuredClone(f.rows);
  f.failAfterOneWrite();
  await expect(updateSyncCheckpointInterval(scope, 0)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  expect(await updateSyncCheckpointInterval(scope, 0)).toMatchObject({ updated: 2 });
});

it('makes all pending work due without creating immutable captures', async () => {
  const f = setup();
  for (let n = 0; n < 130; n++) pending(f, String(n));
  expect(await requestSyncCheckpointFlush(scope, authorization)).toEqual({
    updated: 130,
    alreadyDue: 0,
  });
  expect(
    [...f.table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint')
  ).toHaveLength(130);
  expect(
    [...f.table('sync_capture').values()]
      .map(parseSyncCaptureRecord)
      .some((row) => row?.kind === 'sync-operation')
  ).toBe(false);
  for (const [key, row] of f.table('sync_capture'))
    if (key !== 'profile') expect(row).toMatchObject({ dueAt: 10000 });
  expect(f.table('sync_outbox').size).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps already due revisions stable on repeated manual flush', async () => {
  const f = setup();
  const due = pending(f, 'due', 9000);
  pending(f, 'future');
  expect(await requestSyncCheckpointFlush(scope, authorization)).toEqual({
    updated: 1,
    alreadyDue: 1,
  });
  const before = structuredClone(f.rows);
  expect(await requestSyncCheckpointFlush(scope, authorization)).toEqual({
    updated: 0,
    alreadyDue: 2,
  });
  expect(f.rows).toEqual(before);
  expect(f.table('sync_capture').get(due.key)).toEqual({ ...due, flushRequested: true });
});

it('refuses a stale root exit selection after pending recreation', async () => {
  const f = setup();
  const previous = pending(f, 'root');
  const replacement = pending(f, 'root');
  const other = pending(f, 'other');
  const selection = {
    rootKind: previous.rootKind,
    rootId: previous.rootId,
    revision: previous.revision,
  };
  await expect(requestSyncCheckpointFlush(scope, authorization, selection)).rejects.toMatchObject({
    code: 'selection-changed',
  });
  expect(f.table('sync_capture').get(previous.key)).toEqual(replacement);
  expect(
    await requestSyncCheckpointFlush(scope, authorization, {
      ...selection,
      revision: replacement.revision,
    })
  ).toMatchObject({ updated: 1 });
  expect(f.table('sync_capture').get(other.key)).toEqual(other);
});

it('refuses manual flush while paused or authorization changed', async () => {
  const f = setup();
  pending(f, 'root');
  const before = structuredClone(f.rows);
  await expect(
    requestSyncCheckpointFlush(scope, { ...authorization, revision: 2 })
  ).rejects.toThrow();
  expect(f.rows).toEqual(before);
  f.table('sync_outbox').set(queueConnectionKey(scope), {
    ...scope,
    key: queueConnectionKey(scope),
    version: 1,
    kind: 'queue-connection',
    revision: 0,
    paused: true,
    scheduleProgress: null,
    eventSequence: 0,
    pendingTransitions: [],
    droppedTransitions: 0,
  });
  const paused = structuredClone(f.rows);
  await expect(requestSyncCheckpointFlush(scope, authorization)).rejects.toMatchObject({
    code: 'paused',
  });
  expect(f.rows).toEqual(paused);
  expect(await updateSyncCheckpointInterval(scope, 60000)).toMatchObject({ updated: 1 });
  expect(f.table('sync_outbox').get(queueConnectionKey(scope))).toMatchObject({ paused: true });
});

it('refuses stale policy scope and invalid intervals', async () => {
  const f = setup();
  pending(f, 'root');
  const before = structuredClone(f.rows);
  await expect(
    updateSyncCheckpointInterval({ ...scope, profileCreatedAt: 2 }, 60000)
  ).rejects.toThrow();
  for (const interval of [1, -1, '60000', null, 120000])
    await expect(updateSyncCheckpointInterval(scope, interval)).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it('keeps the entire pending set unchanged after manual flush persistence failure', async () => {
  const f = setup();
  pending(f, 'first');
  pending(f, 'second');
  const before = structuredClone(f.rows);
  f.failAfterOneWrite();
  await expect(requestSyncCheckpointFlush(scope, authorization)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  expect(await requestSyncCheckpointFlush(scope, authorization)).toMatchObject({ updated: 2 });
});

it.each(['policy', 'flush', 'exit'] as const)(
  'refuses a delayed %s command after profile recreation',
  async (kind) => {
    const f = setup();
    const row = pending(f, 'root');
    let command: Promise<unknown> = Promise.resolve();
    await runWithExclusivePersistenceMutationPermit(async () => {
      command =
        kind === 'policy'
          ? updateSyncCheckpointInterval(scope, 0)
          : kind === 'flush'
            ? requestSyncCheckpointFlush(scope, authorization)
            : requestSyncCheckpointExit(scope, authorization, {
                rootKind: row.rootKind,
                rootId: row.rootId,
                revision: row.revision,
              });
      f.table('sync_capture').set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        enabled: true,
        ...scope,
        createdAt: 2,
      });
    });
    const replacement = structuredClone(f.rows);
    await expect(command).rejects.toThrow();
    expect(f.rows).toEqual(replacement);
  }
);

it.each(['flush', 'exit'] as const)(
  'does not reopen a replacement database for delayed %s after waiting for the mutation permit',
  async (kind) => {
    const original = setup();
    const row = pending(original, 'old');
    const replacement = setup();
    pending(replacement, 'new');
    const before = structuredClone(replacement.rows);
    io.prepared.mockReturnValue(original.database);
    let command: Promise<unknown> = Promise.resolve();
    await runWithExclusivePersistenceMutationPermit(async () => {
      command =
        kind === 'flush'
          ? requestSyncCheckpointFlush(scope, authorization)
          : requestSyncCheckpointExit(scope, authorization, {
              rootKind: row.rootKind,
              rootId: row.rootId,
              revision: row.revision,
            });
      io.prepared.mockReturnValue(replacement.database);
      vi.spyOn(original.database, 'transaction').mockImplementation(() => {
        throw new DOMException('Database handle is closed.', 'InvalidStateError');
      });
    });
    await expect(command).rejects.toThrow();
    expect(replacement.rows).toEqual(before);
    expect(io.prepared).toHaveBeenCalledOnce();
  }
);

it('does not postpone an accepted manual flush when the automatic interval increases', async () => {
  const f = setup();
  const row = pending(f, 'manual');
  await requestSyncCheckpointFlush(scope, authorization);
  await updateSyncCheckpointInterval(scope, 3600000);
  expect(f.table('sync_capture').get(row.key)).toMatchObject({ dueAt: 10000 });
});

it('retains explicit flush intent through later saves and clears it with exact consumption', async () => {
  const f = setup();
  const row = pending(f, 'root');
  await requestSyncCheckpointFlush(scope, authorization);
  await updateSyncCheckpointInterval(scope, 3600000);
  const tx = f.database.transaction(['sync_capture'], 'readwrite');
  const next = await deferCheckpointInTransaction(tx, row, 20000);
  expect(next).toMatchObject({ dueAt: 10000, flushRequested: true });
  if (!next) throw new Error('Expected pending checkpoint.');
  expect(await consumeCheckpointInTransaction(tx, next)).toBe(true);
  const later = await deferCheckpointInTransaction(tx, row, 21000);
  expect(later).toMatchObject({ dueAt: 3621000 });
  expect(later?.flushRequested).toBeUndefined();
  await tx.done;
});

it('reads the effective interval without initializing or mutating native data', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  expect(await readSyncCheckpointInterval(scope)).toBe(300000);
  expect(f.rows).toEqual(before);
  await updateSyncCheckpointInterval(scope, 300000);
  const configured = structuredClone(f.rows);
  expect(await readSyncCheckpointInterval(scope)).toBe(300000);
  expect(f.rows).toEqual(configured);
  expect(fetch).not.toHaveBeenCalled();
});
it('refuses stale or missing policy scope without repairing storage', async () => {
  const f = setup();
  const before = structuredClone(f.rows);
  await expect(readSyncCheckpointInterval({ ...scope, profileCreatedAt: 99 })).rejects.toThrow();
  expect(f.rows).toEqual(before);
  io.prepared.mockReturnValue(null);
  await expect(readSyncCheckpointInterval(scope)).rejects.toThrow();
});

it('records exact exit intent while both connection and queue are paused without resuming them', async () => {
  const f = setup();
  const row = pending(f, 'exit');
  const metadata = parseConnectionMetadata(f.table('sync_connection').get('connection'));
  if (!metadata) throw new Error('Connection missing');
  f.table('sync_connection').set('connection', { ...metadata, phase: 'paused' });
  f.table('sync_outbox').set(queueConnectionKey(scope), {
    ...scope,
    version: 1,
    kind: 'queue-connection',
    key: queueConnectionKey(scope),
    revision: 1,
    paused: true,
    scheduleProgress: null,
    eventSequence: 0,
    pendingTransitions: [],
    droppedTransitions: 0,
  });
  const connectionBefore = structuredClone(f.table('sync_connection'));
  const queueBefore = structuredClone(f.table('sync_outbox'));
  expect(
    await requestSyncCheckpointExit(scope, authorization, {
      rootKind: row.rootKind,
      rootId: row.rootId,
      revision: row.revision,
    })
  ).toEqual({ outcome: 'requested' });
  expect(f.table('sync_capture').get(row.key)).toMatchObject({
    dueAt: 10000,
    flushRequested: true,
  });
  expect(f.table('sync_connection')).toEqual(connectionBefore);
  expect(f.table('sync_outbox')).toEqual(queueBefore);
  expect(fetch).not.toHaveBeenCalled();
});
it('does not force a replacement save or recreated identity from a stale exit receipt', async () => {
  const f = setup();
  const old = pending(f, 'recreated');
  f.table('sync_capture').delete(old.key);
  pending(f, old.rootId);
  const before = structuredClone(f.rows);
  expect(
    await requestSyncCheckpointExit(scope, authorization, {
      rootKind: old.rootKind,
      rootId: old.rootId,
      revision: old.revision,
    })
  ).toEqual({ outcome: 'stale' });
  expect(f.rows).toEqual(before);
});
it('leaves settled work unchanged and does not search for another exit selection', async () => {
  const f = setup();
  const old = pending(f, 'settled');
  f.table('sync_capture').delete(old.key);
  pending(f, 'unrelated');
  const before = structuredClone(f.rows);
  expect(
    await requestSyncCheckpointExit(scope, authorization, {
      rootKind: old.rootKind,
      rootId: old.rootId,
      revision: old.revision,
    })
  ).toEqual({ outcome: 'not-pending' });
  expect(f.rows).toEqual(before);
});
it('keeps repeated already-due exit intent idempotent', async () => {
  const f = setup();
  const row = pending(f, 'due', 9000);
  const receipt = { rootKind: row.rootKind, rootId: row.rootId, revision: row.revision };
  expect(await requestSyncCheckpointExit(scope, authorization, receipt)).toEqual({
    outcome: 'already-due',
  });
  const before = structuredClone(f.rows);
  expect(await requestSyncCheckpointExit(scope, authorization, receipt)).toEqual({
    outcome: 'already-due',
  });
  expect(f.rows).toEqual(before);
});
it('refuses invalid exit receipts and stale connection authority without native writes', async () => {
  const f = setup();
  const row = pending(f, 'invalid');
  const receipt = { rootKind: row.rootKind, rootId: row.rootId, revision: row.revision };
  const before = structuredClone(f.rows);
  for (const invalid of [
    null,
    undefined,
    { ...receipt, revision: '1' },
    { ...receipt, authorization },
  ])
    await expect(requestSyncCheckpointExit(scope, authorization, invalid)).rejects.toThrow();
  await expect(
    requestSyncCheckpointExit(scope, { ...authorization, revision: 99 }, receipt)
  ).rejects.toThrow();
  expect(f.rows).toEqual(before);
});

it('preserves exact exit state after a failed write and permits a successful retry', async () => {
  const f = setup();
  const row = pending(f, 'retry-exit');
  const receipt = { rootKind: row.rootKind, rootId: row.rootId, revision: row.revision };
  const before = structuredClone(f.rows);
  f.failNextCaptureWrite();
  await expect(requestSyncCheckpointExit(scope, authorization, receipt)).rejects.toThrow();
  expect(f.rows).toEqual(before);
  expect(await requestSyncCheckpointExit(scope, authorization, receipt)).toEqual({
    outcome: 'requested',
  });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([0, 60000, 300000, 900000, 1800000, 3600000])(
  'reads explicit interval %s without changing profile or pending intent',
  async (checkpointIntervalMs) => {
    const f = setup();
    const profile = parseSyncCaptureRecord(f.table('sync_capture').get('profile'));
    if (!profile || profile.kind !== 'profile') throw new Error('Expected profile');
    f.table('sync_capture').set('profile', { ...profile, checkpointIntervalMs });
    const before = structuredClone(f.rows);
    expect(await readSyncCheckpointInterval(scope)).toBe(checkpointIntervalMs);
    expect(f.rows).toEqual(before);
  }
);
