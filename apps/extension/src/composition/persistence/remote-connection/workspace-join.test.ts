// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  createSyncWorkspaceJoin,
  loadSyncWorkspaceJoin,
  beginSyncWorkspaceJoin,
  completeSyncWorkspaceJoin,
  abandonSyncWorkspaceJoin,
  revokeSyncWorkspaceJoin,
  readReadySyncWorkspaceJoin,
} from './workspace-join';
import {
  createSyncWorkspaceAllocation,
  commandSyncWorkspaceAllocation,
} from './workspace-allocation';
import { withSyncConnectionAdmissionLock } from './coordination';
import { connectionUuid } from './model';
import { encodeSyncWorkspaceMarker } from '../../../contracts/sync-workspace';
import { runWithPersistentDataErasureBarrier } from '../infrastructure/mutation-barrier';

const io = vi.hoisted(() => ({ database: vi.fn(), capture: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: io.database,
  capturePreparedDatabase: io.capture,
}));
let lockObserved: ((name: string) => void) | null = null;
const input = { rootUrl: 'https://dav.example.test/selected/', accountId: 'alice', expected: null };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  lockObserved = null;
  vi.stubGlobal('crypto', webcrypto);
  const pending = new Map<string, Promise<unknown>>();
  const exclusiveRequests = new Map<string, number>();
  vi.stubGlobal('navigator', {
    locks: {
      request: (
        name: string,
        options: { mode: string; ifAvailable?: boolean },
        callback: (lock?: unknown) => unknown
      ) => {
        lockObserved?.(name);
        if (options.ifAvailable && exclusiveRequests.has(name))
          return Promise.resolve(callback(null));
        if (options.mode === 'exclusive')
          exclusiveRequests.set(name, (exclusiveRequests.get(name) ?? 0) + 1);
        const result = (pending.get(name) ?? Promise.resolve())
          .then(() => callback({}))
          .finally(() => {
            if (options.mode !== 'exclusive') return;
            const remaining = (exclusiveRequests.get(name) ?? 1) - 1;
            if (remaining) exclusiveRequests.set(name, remaining);
            else exclusiveRequests.delete(name);
          });
        pending.set(
          name,
          result.catch(() => undefined)
        );
        return result;
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

/** Atomic snapshot fixture: put only changes a private transaction until done succeeds. */
function setup() {
  const rows = new Map<string, Map<string, unknown>>([
    ['sync_capture', new Map()],
    ['sync_connection', new Map()],
    ['sync_outbox', new Map()],
  ]);
  const modes: string[] = [];
  let failCommit = false;
  let aborts = 0;
  let drains = 0;
  let writes = 0;
  const makeDatabase = () => {
    const database = {
      closed: false,
      transaction(stores: string[], mode: string) {
        if (database.closed) throw new DOMException('Closed database', 'InvalidStateError');
        modes.push(mode);
        const pending = structuredClone(rows);
        let aborted = false;
        let completed = false;
        return {
          abort() {
            aborted = true;
            aborts += 1;
          },
          objectStore(name: string) {
            if (!stores.includes(name)) throw new Error('Store outside transaction');
            const table = pending.get(name)!;
            return {
              get: async (key: string) => structuredClone(table.get(key)),
              getAllKeys: async () => [...table.keys()],
              count: async () => table.size,
              delete: async (key: string) => {
                if (mode !== 'readwrite') throw new Error('Readonly write');
                table.delete(key);
                writes += 1;
              },
              put: async (value: unknown) => {
                if (mode !== 'readwrite') throw new Error('Readonly write');
                if (!isRecord(value) || typeof value['key'] !== 'string')
                  throw new Error('Invalid fixture row');
                table.set(value['key'], structuredClone(value));
                writes += 1;
              },
            };
          },
          get done() {
            if (aborted) {
              drains += 1;
              return Promise.reject(new DOMException('Aborted', 'AbortError'));
            }
            if (mode === 'readwrite' && failCommit) {
              failCommit = false;
              return Promise.reject(new DOMException('Late backend failure', 'QuotaExceededError'));
            }
            if (!completed && mode === 'readwrite') {
              rows.clear();
              for (const [name, table] of pending) rows.set(name, table);
            }
            completed = true;
            return Promise.resolve();
          },
        };
      },
    };
    return database;
  };
  let database = makeDatabase();
  io.database.mockResolvedValue(database);
  io.capture.mockImplementation(() => database);
  return {
    erase() {
      database.closed = true;
      for (const table of rows.values()) table.clear();
      database = makeDatabase();
      io.database.mockResolvedValue(database);
    },
    rows,
    modes,
    table: (name = 'sync_connection') => rows.get(name)!,
    failCommit() {
      failCommit = true;
    },
    aborted: () => aborts,
    drained: () => drains,
    writes: () => writes,
  };
}
function workspace() {
  return encodeSyncWorkspaceMarker(crypto.randomUUID(), crypto.randomUUID()).identity;
}
it('admits one intent for parallel opening commands', async () => {
  const f = setup();
  const results = await Promise.allSettled([
    createSyncWorkspaceJoin(input),
    createSyncWorkspaceJoin(input),
  ]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  const join = await loadSyncWorkspaceJoin();
  expect(join).toMatchObject({ ...input, version: 1, phase: 'planned', workspace: null });
  expect(connectionUuid(join?.identity.incarnation)).toBe(true);
  expect(f.table().size).toBe(1);
  expect(f.table('sync_capture').size).toBe(0);
  expect(f.table('sync_outbox').size).toBe(0);
});
it('refuses delayed completion after replacement and revocation', async () => {
  setup();
  const first = await createSyncWorkspaceJoin(input);
  const checking = await beginSyncWorkspaceJoin(first.identity);
  const entered = deferred();
  const release = deferred();
  const delayed = (async () => {
    entered.resolve();
    await release.promise;
    return completeSyncWorkspaceJoin(checking.identity, workspace());
  })();
  await entered.promise;
  const replacement = await createSyncWorkspaceJoin(input, checking.identity);
  expect(replacement.identity.incarnation).not.toBe(first.identity.incarnation);
  release.resolve();
  await expect(delayed).rejects.toThrow('refused');
  const second = await beginSyncWorkspaceJoin(replacement.identity);
  await expect(revokeSyncWorkspaceJoin(first.identity.incarnation)).rejects.toThrow('refused');
  await revokeSyncWorkspaceJoin(second.identity.incarnation);
  await revokeSyncWorkspaceJoin(second.identity.incarnation);
  await expect(completeSyncWorkspaceJoin(second.identity, workspace())).rejects.toThrow('refused');
  expect(await loadSyncWorkspaceJoin()).toBeNull();
});
it('cannot reopen erased recreated storage after admission wait', async () => {
  const f = setup();
  const entered = deferred();
  const release = deferred();
  const held = withSyncConnectionAdmissionLock(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const queued = deferred();
  lockObserved = (name) => {
    if (name === 'sniptale.sync-connection.admission') queued.resolve();
  };
  const opening = createSyncWorkspaceJoin(input);
  const observed = opening.then(
    () => 'written',
    () => 'refused'
  );
  await queued.promise;
  await runWithPersistentDataErasureBarrier(() => f.erase());
  release.resolve();
  await held;
  expect(await observed).toBe('refused');
  const replacement = await createSyncWorkspaceJoin(input);
  expect(await loadSyncWorkspaceJoin()).toEqual(replacement);
  expect(io.database).toHaveBeenCalledTimes(1);
});
it('aborts failed readiness before command retry', async () => {
  const f = setup();
  const first = await createSyncWorkspaceJoin(input);
  const checking = await beginSyncWorkspaceJoin(first.identity);
  const evidence = workspace();
  const before = structuredClone(f.rows);
  f.failCommit();
  await expect(completeSyncWorkspaceJoin(checking.identity, evidence)).rejects.toThrow(
    'Late backend failure'
  );
  expect(f.rows).toEqual(before);
  expect(f.aborted()).toBe(1);
  expect(f.drained()).toBe(1);
  const ready = await completeSyncWorkspaceJoin(checking.identity, evidence);
  expect(ready).toMatchObject({ phase: 'ready', workspace: evidence, expected: evidence });
  await expect(completeSyncWorkspaceJoin(checking.identity, evidence)).rejects.toThrow('refused');
});
it('excludes live allocation and permits explicit mode changes', async () => {
  const f = setup();
  const allocation = await createSyncWorkspaceAllocation({
    parentUrl: input.rootUrl,
    accountId: input.accountId,
  });
  await expect(createSyncWorkspaceJoin(input)).rejects.toThrow('refused');
  const abandoned = await commandSyncWorkspaceAllocation(allocation.identity, 'abandon');
  const join = await createSyncWorkspaceJoin(input);
  await expect(
    createSyncWorkspaceAllocation(
      { parentUrl: input.rootUrl, accountId: input.accountId },
      abandoned.identity
    )
  ).rejects.toThrow('refused');
  await expect(commandSyncWorkspaceAllocation(abandoned.identity, 'abandon')).rejects.toThrow(
    'refused'
  );
  await abandonSyncWorkspaceJoin(join.identity);
  const next = await createSyncWorkspaceAllocation(
    { parentUrl: input.rootUrl, accountId: input.accountId },
    abandoned.identity
  );
  expect(next.identity.incarnation).not.toBe(allocation.identity.incarnation);
  f.table().set('workspace-join', { malformed: true });
  await expect(commandSyncWorkspaceAllocation(next.identity, 'allocate')).rejects.toThrow(
    'refused'
  );
});
it('freezes marker binding across retries with a new checking revision', async () => {
  setup();
  const evidence = workspace();
  const planned = await createSyncWorkspaceJoin({ ...input, expected: evidence });
  await expect(completeSyncWorkspaceJoin(planned.identity, evidence)).rejects.toThrow('refused');
  const checking = await beginSyncWorkspaceJoin(planned.identity);
  await expect(completeSyncWorkspaceJoin(checking.identity, workspace())).rejects.toThrow(
    'refused'
  );
  const ready = await completeSyncWorkspaceJoin(checking.identity, evidence);
  const retry = await beginSyncWorkspaceJoin(ready.identity);
  expect(retry).toEqual({
    ...ready,
    workspace: null,
    phase: 'checking',
    identity: { ...ready.identity, revision: ready.identity.revision + 1 },
  });
  const retryAgain = await beginSyncWorkspaceJoin(retry.identity);
  await expect(completeSyncWorkspaceJoin(retry.identity, evidence)).rejects.toThrow('refused');
  await expect(completeSyncWorkspaceJoin(retryAgain.identity, workspace())).rejects.toThrow(
    'refused'
  );
  expect((await completeSyncWorkspaceJoin(retryAgain.identity, evidence)).workspace).toEqual(
    evidence
  );
});
it('deletes exact abandoned intent and refuses its delayed commands', async () => {
  setup();
  const planned = await createSyncWorkspaceJoin(input);
  const checking = await beginSyncWorkspaceJoin(planned.identity);
  await expect(abandonSyncWorkspaceJoin(planned.identity)).rejects.toThrow('refused');
  await abandonSyncWorkspaceJoin(checking.identity);
  await expect(beginSyncWorkspaceJoin(checking.identity)).rejects.toThrow('refused');
  await expect(completeSyncWorkspaceJoin(checking.identity, workspace())).rejects.toThrow(
    'refused'
  );
  const replacement = await createSyncWorkspaceJoin(input);
  expect(replacement.identity.incarnation).not.toBe(checking.identity.incarnation);
});
it('refuses capture outbox credentials and unrelated native evidence without writes', async () => {
  const f = setup();
  for (const [store, key] of [
    ['sync_capture', 'profile'],
    ['sync_capture', 'capture'],
    ['sync_outbox', 'pending'],
    ['sync_connection', 'connection'],
    ['sync_connection', 'credential'],
    ['sync_connection', 'workspace-enrollment'],
  ] as const) {
    f.table(store).set(key, { malformed: true });
    const before = structuredClone(f.rows);
    await expect(createSyncWorkspaceJoin(input)).rejects.toThrow('refused');
    await expect(loadSyncWorkspaceJoin()).rejects.toThrow('refused');
    expect(f.rows).toEqual(before);
    f.table(store).clear();
  }
  f.table().set('workspace-allocation', { phase: 'abandoned' });
  await expect(createSyncWorkspaceJoin(input)).rejects.toThrow('refused');
});
it('reads ready evidence in enrollment replay without the unenrolled guard', async () => {
  const f = setup();
  const planned = await createSyncWorkspaceJoin(input);
  const checking = await beginSyncWorkspaceJoin(planned.identity);
  const ready = await completeSyncWorkspaceJoin(checking.identity, workspace());
  f.table('sync_capture').set('profile', { enrolled: true });
  f.table().set('connection', { enrolled: true });
  const db = await io.database();
  const tx = db.transaction(['sync_connection'], 'readonly');
  expect(await readReadySyncWorkspaceJoin(tx, ready.identity)).toEqual(ready);
  await expect(readReadySyncWorkspaceJoin(tx, checking.identity)).rejects.toThrow('refused');
  await expect(beginSyncWorkspaceJoin(ready.identity)).rejects.toThrow('refused');
  await expect(revokeSyncWorkspaceJoin(ready.identity.incarnation)).rejects.toThrow('refused');
  expect(f.table().get('workspace-join')).toEqual(ready);
});
it('refuses malformed and legacy evidence without read repair', async () => {
  const f = setup();
  const planned = await createSyncWorkspaceJoin(input);
  const evidence = workspace();
  for (const row of [
    { ...planned, version: 0 },
    { ...planned, extra: true },
    { ...planned, accountId: 'bad\naccount' },
    { ...planned, rootUrl: 'http://dav.example.test/' },
    { ...planned, phase: 'ready' },
    { ...planned, workspace: evidence },
    { ...planned, phase: 'ready', workspace: evidence, expected: workspace() },
    { ...planned, expected: { ...evidence, extra: true } },
    { ...planned, identity: { ...planned.identity, extra: true } },
  ]) {
    f.table().set('workspace-join', row);
    const before = structuredClone(f.rows);
    const writes = f.writes();
    await expect(loadSyncWorkspaceJoin()).rejects.toThrow('refused');
    await expect(beginSyncWorkspaceJoin(planned.identity)).rejects.toThrow('refused');
    expect(f.rows).toEqual(before);
    expect(f.writes()).toBe(writes);
  }
});
it('validates detached selection and completion inputs before admission', async () => {
  const f = setup();
  for (const bad of [
    { ...input, rootUrl: 'https://alice:secret@dav.example.test/' },
    { ...input, rootUrl: 'https://dav.example.test/root' },
    { ...input, rootUrl: 'https://dav.example.test/a/../' },
    { ...input, expected: undefined },
    { ...input, accountId: '' },
    { ...input, credential: 'secret' },
  ])
    await expect(createSyncWorkspaceJoin(bad)).rejects.toThrow('refused');
  const caller = { ...input };
  const opening = createSyncWorkspaceJoin(caller);
  caller.accountId = 'bob';
  const planned = await opening;
  expect(planned.accountId).toBe('alice');
  const checking = await beginSyncWorkspaceJoin(planned.identity);
  const before = structuredClone(f.rows);
  for (const bad of [
    null,
    undefined,
    {},
    { ...workspace(), extra: true },
    { ...workspace(), fingerprint: 'bad' },
  ])
    await expect(completeSyncWorkspaceJoin(checking.identity, bad)).rejects.toThrow('refused');
  expect(f.rows).toEqual(before);
});
it('refuses cold opening without initializing storage', async () => {
  const f = setup();
  io.capture.mockReturnValueOnce(null);
  await expect(createSyncWorkspaceJoin(input)).rejects.toThrow('refused');
  expect(io.database).not.toHaveBeenCalled();
  expect(f.modes).toEqual([]);
});
